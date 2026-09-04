const express=require("express");
const supabase=require("../supabase");
const pool=require("../db");

const router=express.Router();

const ADMIN=["ADMIN"];
const PROGRAM_STATUS=["DRAFT","UPCOMING","ONGOING","COMPLETED","CANCELLED"];
const SESSION_STATUS=["SCHEDULED","LIVE","COMPLETED","CANCELLED"];
const MEETING_TYPES=["PHYSICAL","ZOOM","GOOGLE_MEET","ONLINE","HYBRID"];
const ENROLLMENT_STATUS=["ENROLLED","IN_PROGRESS","COMPLETED","ABSENT","WITHDRAWN"];
const ATTENDANCE_STATUS=["PRESENT","ABSENT","LATE","EXCUSED"];

async function auth(req,res){
    try{
        const h=req.headers.authorization;
        if(!h?.startsWith("Bearer ")){
            res.status(401).json({success:false,message:"Authorization token is required."});
            return null;
        }

        const token=h.replace("Bearer ","");
        const {data,error}=await supabase.auth.getUser(token);

        if(error||!data?.user){
            res.status(401).json({success:false,message:"Invalid or expired staff session."});
            return null;
        }

        const {rows}=await pool.query(
            `SELECT id,full_name,username,email,role,position,department,phone,is_active
             FROM users WHERE id=$1 LIMIT 1`,
            [data.user.id]
        );

        const user=rows[0];

        if(!user){
            res.status(403).json({success:false,message:"Staff account was not found."});
            return null;
        }

        if(!user.is_active){
            res.status(403).json({success:false,message:"This staff account is inactive."});
            return null;
        }

        const role=String(user.role||"").toUpperCase();

        if(!["STAFF","ADMIN"].includes(role)){
            res.status(403).json({success:false,message:"You do not have staff portal access."});
            return null;
        }

        user.isAdmin=ADMIN.includes(role);
        return user;
    }catch(e){
        console.error("TRAINING AUTH ERROR:",e);
        res.status(500).json({success:false,message:"Unable to authenticate staff account."});
        return null;
    }
}

async function staffId(user){
    const {rows}=await pool.query(
        `SELECT id FROM staff WHERE user_id=$1 LIMIT 1`,
        [user.id]
    );
    return rows[0]?.id||null;
}

function adminOnly(user,res){
    if(!user?.isAdmin){
        res.status(403).json({
            success:false,
            message:"Only administrators can perform this action."
        });
        return false;
    }
    return true;
}

function id(value){
    return String(value||"").trim();
}

function valid(value,list){
    return list.includes(String(value||"").toUpperCase());
}

/* ============================================================
   TRAINING DASHBOARD
   GET /api/training/dashboard
============================================================ */
router.get("/dashboard",async(req,res)=>{
    try{
        const user=await auth(req,res);
        if(!user)return;

        const sid=await staffId(user);

        const [
            programs,
            upcoming,
            enrollments,
            certificates,
            notifications
        ]=await Promise.all([
            pool.query(`
                SELECT COUNT(*)::INTEGER count
                FROM training_programs
                WHERE status IN ('UPCOMING','ONGOING')
            `),
            pool.query(`
                SELECT ts.*,tp.title program_title,tp.category
                FROM training_sessions ts
                JOIN training_programs tp ON tp.id=ts.program_id
                WHERE ts.session_date>=NOW()
                AND ts.status<>'CANCELLED'
                ORDER BY ts.session_date ASC
                LIMIT 5
            `),
            sid?pool.query(`
                SELECT COUNT(*)::INTEGER count
                FROM training_enrollments
                WHERE staff_id=$1
                AND status IN ('ENROLLED','IN_PROGRESS')
            `,[sid]):{rows:[{count:0}]},
            sid?pool.query(`
                SELECT COUNT(*)::INTEGER count
                FROM training_certificates
                WHERE staff_id=$1
                AND status='ACTIVE'
            `,[sid]):{rows:[{count:0}]},
            sid?pool.query(`
                SELECT COUNT(*)::INTEGER count
                FROM training_notifications
                WHERE staff_id=$1
                AND is_read=FALSE
            `,[sid]):{rows:[{count:0}]}
        ]);

        res.json({
            success:true,
            statistics:{
                activePrograms:programs.rows[0]?.count||0,
                myActiveTraining:enrollments.rows[0]?.count||0,
                certificates:certificates.rows[0]?.count||0,
                unreadNotifications:notifications.rows[0]?.count||0
            },
            upcoming:upcoming.rows
        });
    }catch(e){
        console.error("TRAINING DASHBOARD ERROR:",e);
        res.status(500).json({success:false,message:"Unable to load training dashboard."});
    }
});

/* ============================================================
   PROGRAMS
============================================================ */

router.get("/programs",async(req,res)=>{
    try{
        const user=await auth(req,res);
        if(!user)return;

        const {status,category,search}=req.query;
        const params=[];
        const where=[];

        if(status){
            params.push(String(status).toUpperCase());
            where.push(`tp.status=$${params.length}`);
        }

        if(category){
            params.push(String(category));
            where.push(`LOWER(tp.category)=LOWER($${params.length})`);
        }

        if(search){
            params.push(`%${String(search).trim()}%`);
            where.push(`(
                tp.title ILIKE $${params.length}
                OR COALESCE(tp.description,'') ILIKE $${params.length}
                OR COALESCE(tp.trainer_name,'') ILIKE $${params.length}
                OR COALESCE(tp.category,'') ILIKE $${params.length}
            )`);
        }

        const {rows}=await pool.query(`
            SELECT
                tp.*,
                COUNT(DISTINCT te.id)::INTEGER enrolled_count
            FROM training_programs tp
            LEFT JOIN training_enrollments te ON te.program_id=tp.id
            ${where.length?"WHERE "+where.join(" AND "):""}
            GROUP BY tp.id
            ORDER BY
                CASE tp.status
                    WHEN 'ONGOING' THEN 1
                    WHEN 'UPCOMING' THEN 2
                    WHEN 'DRAFT' THEN 3
                    WHEN 'COMPLETED' THEN 4
                    ELSE 5
                END,
                tp.start_date ASC NULLS LAST,
                tp.created_at DESC
        `,params);

        res.json({success:true,programs:rows});
    }catch(e){
        console.error("GET TRAINING PROGRAMS ERROR:",e);
        res.status(500).json({success:false,message:"Unable to load training programs."});
    }
});

router.get("/programs/:id",async(req,res)=>{
    try{
        const user=await auth(req,res);
        if(!user)return;

        const programId=id(req.params.id);

        const [program,sessions,groups,materials]=await Promise.all([
            pool.query(`SELECT * FROM training_programs WHERE id=$1 LIMIT 1`,[programId]),
            pool.query(`
                SELECT * FROM training_sessions
                WHERE program_id=$1
                ORDER BY session_date ASC
            `,[programId]),
            pool.query(`
                SELECT tg.*,COUNT(tgm.id)::INTEGER member_count
                FROM training_groups tg
                LEFT JOIN training_group_members tgm ON tgm.group_id=tg.id
                WHERE tg.program_id=$1
                GROUP BY tg.id
                ORDER BY tg.name
            `,[programId]),
            pool.query(`
                SELECT * FROM training_materials
                WHERE program_id=$1
                ORDER BY created_at DESC
            `,[programId])
        ]);

        if(!program.rows.length){
            return res.status(404).json({
                success:false,
                message:"Training program was not found."
            });
        }

        res.json({
            success:true,
            program:program.rows[0],
            sessions:sessions.rows,
            groups:groups.rows,
            materials:materials.rows
        });
    }catch(e){
        console.error("GET TRAINING PROGRAM ERROR:",e);
        res.status(500).json({success:false,message:"Unable to load training program."});
    }
});

router.post("/programs",async(req,res)=>{
    try{
        const user=await auth(req,res);
        if(!user||!adminOnly(user,res))return;

        const b=req.body||{};

        if(!String(b.title||"").trim()){
            return res.status(400).json({
                success:false,
                message:"Training title is required."
            });
        }

        const status=String(b.status||"UPCOMING").toUpperCase();

        if(!valid(status,PROGRAM_STATUS)){
            return res.status(400).json({
                success:false,
                message:"Invalid training program status."
            });
        }

        const {rows}=await pool.query(`
            INSERT INTO training_programs
            (title,description,category,trainer_name,trainer_organization,
             start_date,end_date,duration_minutes,required,status,cover_image,created_by)
            VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
            RETURNING *
        `,[
            String(b.title).trim(),
            b.description||null,
            b.category||"Other",
            b.trainer_name||null,
            b.trainer_organization||null,
            b.start_date||null,
            b.end_date||null,
            b.duration_minutes||null,
            Boolean(b.required),
            status,
            b.cover_image||null,
            user.id
        ]);

        res.status(201).json({
            success:true,
            message:"Training program created successfully.",
            program:rows[0]
        });
    }catch(e){
        console.error("CREATE TRAINING PROGRAM ERROR:",e);
        res.status(500).json({success:false,message:"Unable to create training program."});
    }
});

router.patch("/programs/:id",async(req,res)=>{
    try{
        const user=await auth(req,res);
        if(!user||!adminOnly(user,res))return;

        const b=req.body||{};
        const fields=[
            "title","description","category","trainer_name",
            "trainer_organization","start_date","end_date",
            "duration_minutes","required","status","cover_image"
        ];

        const sets=[];
        const values=[];

        fields.forEach(f=>{
            if(Object.prototype.hasOwnProperty.call(b,f)){
                if(f==="status"&&!valid(b[f],PROGRAM_STATUS))return;
                values.push(b[f]);
                sets.push(`${f}=$${values.length}`);
            }
        });

        if(!sets.length){
            return res.status(400).json({
                success:false,
                message:"No valid changes were supplied."
            });
        }

        values.push(req.params.id);

        const {rows}=await pool.query(`
            UPDATE training_programs
            SET ${sets.join(",")},updated_at=NOW()
            WHERE id=$${values.length}
            RETURNING *
        `,values);

        if(!rows.length){
            return res.status(404).json({
                success:false,
                message:"Training program was not found."
            });
        }

        res.json({
            success:true,
            message:"Training program updated successfully.",
            program:rows[0]
        });
    }catch(e){
        console.error("UPDATE TRAINING PROGRAM ERROR:",e);
        res.status(500).json({success:false,message:"Unable to update training program."});
    }
});

router.delete("/programs/:id",async(req,res)=>{
    try{
        const user=await auth(req,res);
        if(!user||!adminOnly(user,res))return;

        const result=await pool.query(
            `DELETE FROM training_programs WHERE id=$1`,
            [req.params.id]
        );

        if(!result.rowCount){
            return res.status(404).json({
                success:false,
                message:"Training program was not found."
            });
        }

        res.json({
            success:true,
            message:"Training program deleted successfully."
        });
    }catch(e){
        console.error("DELETE TRAINING PROGRAM ERROR:",e);
        res.status(500).json({success:false,message:"Unable to delete training program."});
    }
});

/* ============================================================
   SESSIONS / ZOOM
============================================================ */

router.get("/sessions",async(req,res)=>{
    try{
        const user=await auth(req,res);
        if(!user)return;

        const {program_id,from,to}=req.query;
        const params=[];
        const where=[];

        if(program_id){
            params.push(program_id);
            where.push(`ts.program_id=$${params.length}`);
        }

        if(from){
            params.push(from);
            where.push(`ts.session_date>=$${params.length}`);
        }

        if(to){
            params.push(to);
            where.push(`ts.session_date<=$${params.length}`);
        }

        const {rows}=await pool.query(`
            SELECT
                ts.*,
                tp.title program_title,
                tp.category program_category
            FROM training_sessions ts
            JOIN training_programs tp ON tp.id=ts.program_id
            ${where.length?"WHERE "+where.join(" AND "):""}
            ORDER BY ts.session_date ASC
        `,params);

        res.json({success:true,sessions:rows});
    }catch(e){
        console.error("GET TRAINING SESSIONS ERROR:",e);
        res.status(500).json({success:false,message:"Unable to load training sessions."});
    }
});

router.get("/sessions/upcoming",async(req,res)=>{
    try{
        const user=await auth(req,res);
        if(!user)return;

        const {rows}=await pool.query(`
            SELECT
                ts.*,
                tp.title program_title,
                tp.category program_category
            FROM training_sessions ts
            JOIN training_programs tp ON tp.id=ts.program_id
            WHERE ts.session_date>=NOW()
            AND ts.status<>'CANCELLED'
            ORDER BY ts.session_date ASC
            LIMIT 20
        `);

        res.json({success:true,sessions:rows});
    }catch(e){
        console.error("GET UPCOMING TRAINING ERROR:",e);
        res.status(500).json({success:false,message:"Unable to load upcoming sessions."});
    }
});

router.post("/sessions",async(req,res)=>{
    try{
        const user=await auth(req,res);
        if(!user||!adminOnly(user,res))return;

        const b=req.body||{};

        if(!b.program_id||!String(b.title||"").trim()||!b.session_date){
            return res.status(400).json({
                success:false,
                message:"Program, session title and session date are required."
            });
        }

        const meeting=String(b.meeting_type||"PHYSICAL").toUpperCase();
        const status=String(b.status||"SCHEDULED").toUpperCase();

        if(!valid(meeting,MEETING_TYPES)||!valid(status,SESSION_STATUS)){
            return res.status(400).json({
                success:false,
                message:"Invalid meeting type or session status."
            });
        }

        const {rows}=await pool.query(`
            INSERT INTO training_sessions
            (program_id,title,description,session_date,end_date,location,
             meeting_type,meeting_url,meeting_id,meeting_password,
             recording_url,materials_url,trainer_name,status)
            VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
            RETURNING *
        `,[
            b.program_id,
            String(b.title).trim(),
            b.description||null,
            b.session_date,
            b.end_date||null,
            b.location||null,
            meeting,
            b.meeting_url||null,
            b.meeting_id||null,
            b.meeting_password||null,
            b.recording_url||null,
            b.materials_url||null,
            b.trainer_name||null,
            status
        ]);

        res.status(201).json({
            success:true,
            message:"Training session scheduled successfully.",
            session:rows[0]
        });
    }catch(e){
        console.error("CREATE TRAINING SESSION ERROR:",e);
        res.status(500).json({success:false,message:"Unable to create training session."});
    }
});

router.patch("/sessions/:id",async(req,res)=>{
    try{
        const user=await auth(req,res);
        if(!user||!adminOnly(user,res))return;

        const b=req.body||{};
        const fields=[
            "title","description","session_date","end_date","location",
            "meeting_type","meeting_url","meeting_id","meeting_password",
            "recording_url","materials_url","trainer_name","status"
        ];

        const sets=[];
        const values=[];

        fields.forEach(f=>{
            if(Object.prototype.hasOwnProperty.call(b,f)){
                if(f==="meeting_type"&&!valid(b[f],MEETING_TYPES))return;
                if(f==="status"&&!valid(b[f],SESSION_STATUS))return;
                values.push(b[f]);
                sets.push(`${f}=$${values.length}`);
            }
        });

        if(!sets.length){
            return res.status(400).json({
                success:false,
                message:"No valid changes were supplied."
            });
        }

        values.push(req.params.id);

        const {rows}=await pool.query(`
            UPDATE training_sessions
            SET ${sets.join(",")},updated_at=NOW()
            WHERE id=$${values.length}
            RETURNING *
        `,values);

        if(!rows.length){
            return res.status(404).json({
                success:false,
                message:"Training session was not found."
            });
        }

        res.json({
            success:true,
            message:"Training session updated successfully.",
            session:rows[0]
        });
    }catch(e){
        console.error("UPDATE TRAINING SESSION ERROR:",e);
        res.status(500).json({success:false,message:"Unable to update training session."});
    }
});

/* ============================================================
   ENROLLMENT
============================================================ */

router.get("/my-training",async(req,res)=>{
    try{
        const user=await auth(req,res);
        if(!user)return;

        const sid=await staffId(user);

        if(!sid){
            return res.json({success:true,staff_id:null,training:[]});
        }

        const {rows}=await pool.query(`
            SELECT
                te.*,
                tp.title,
                tp.description,
                tp.category,
                tp.trainer_name,
                tp.start_date,
                tp.end_date,
                tp.required,
                tg.name group_name,
                tg.facilitator_name
            FROM training_enrollments te
            JOIN training_programs tp ON tp.id=te.program_id
            LEFT JOIN training_groups tg ON tg.id=te.group_id
            WHERE te.staff_id=$1
            ORDER BY
                CASE te.status
                    WHEN 'IN_PROGRESS' THEN 1
                    WHEN 'ENROLLED' THEN 2
                    WHEN 'COMPLETED' THEN 3
                    ELSE 4
                END,
                tp.start_date DESC NULLS LAST
        `,[sid]);

        res.json({success:true,staff_id:sid,training:rows});
    }catch(e){
        console.error("GET MY TRAINING ERROR:",e);
        res.status(500).json({success:false,message:"Unable to load your training."});
    }
});

router.post("/enroll",async(req,res)=>{
    try{
        const user=await auth(req,res);
        if(!user)return;

        const sid=await staffId(user);

        if(!sid){
            return res.status(404).json({
                success:false,
                message:"Your staff profile could not be found."
            });
        }

        const programId=req.body?.program_id;

        if(!programId){
            return res.status(400).json({
                success:false,
                message:"Training program is required."
            });
        }

        const {rows}=await pool.query(`
            INSERT INTO training_enrollments(program_id,staff_id)
            VALUES($1,$2)
            ON CONFLICT(program_id,staff_id)
            DO UPDATE SET updated_at=NOW()
            RETURNING *
        `,[programId,sid]);

        res.status(201).json({
            success:true,
            message:"You have been enrolled successfully.",
            enrollment:rows[0]
        });
    }catch(e){
        console.error("TRAINING ENROLL ERROR:",e);
        res.status(500).json({success:false,message:"Unable to enroll in training."});
    }
});

/* ============================================================
   ADMIN ENROLL / ASSIGN STAFF
============================================================ */

router.post("/enrollments",async(req,res)=>{
    try{
        const user=await auth(req,res);
        if(!user||!adminOnly(user,res))return;

        const {program_id,staff_id,group_id,status}=req.body||{};

        if(!program_id||!staff_id){
            return res.status(400).json({
                success:false,
                message:"Program and staff member are required."
            });
        }

        const s=String(status||"ENROLLED").toUpperCase();

        if(!valid(s,ENROLLMENT_STATUS)){
            return res.status(400).json({
                success:false,
                message:"Invalid enrollment status."
            });
        }

        const {rows}=await pool.query(`
            INSERT INTO training_enrollments
            (program_id,staff_id,group_id,status)
            VALUES($1,$2,$3,$4)
            ON CONFLICT(program_id,staff_id)
            DO UPDATE SET
                group_id=EXCLUDED.group_id,
                status=EXCLUDED.status,
                updated_at=NOW()
            RETURNING *
        `,[program_id,staff_id,group_id||null,s]);

        res.status(201).json({
            success:true,
            message:"Staff training assignment saved.",
            enrollment:rows[0]
        });
    }catch(e){
        console.error("ADMIN TRAINING ENROLL ERROR:",e);
        res.status(500).json({success:false,message:"Unable to assign staff training."});
    }
});

router.get("/enrollments/:programId",async(req,res)=>{
    try{
        const user=await auth(req,res);
        if(!user||!adminOnly(user,res))return;

        const {rows}=await pool.query(`
            SELECT
                te.*,
                s.id staff_id,
                COALESCE(u.full_name,sp.full_name,'Staff') staff_name,
                COALESCE(u.email,sp.email) email,
                tg.name group_name
            FROM training_enrollments te
            JOIN staff s ON s.id=te.staff_id
            LEFT JOIN users u ON u.id=s.user_id
            LEFT JOIN staff_profiles sp ON sp.user_id=s.user_id
            LEFT JOIN training_groups tg ON tg.id=te.group_id
            WHERE te.program_id=$1
            ORDER BY staff_name
        `,[req.params.programId]);

        res.json({success:true,enrollments:rows});
    }catch(e){
        console.error("GET TRAINING ENROLLMENTS ERROR:",e);
        res.status(500).json({success:false,message:"Unable to load training enrollments."});
    }
});

/* ============================================================
   GROUPS
============================================================ */

router.get("/groups/:programId",async(req,res)=>{
    try{
        const user=await auth(req,res);
        if(!user)return;

        const {rows}=await pool.query(`
            SELECT
                tg.*,
                COUNT(tgm.id)::INTEGER member_count
            FROM training_groups tg
            LEFT JOIN training_group_members tgm ON tgm.group_id=tg.id
            WHERE tg.program_id=$1
            GROUP BY tg.id
            ORDER BY tg.name
        `,[req.params.programId]);

        res.json({success:true,groups:rows});
    }catch(e){
        console.error("GET TRAINING GROUPS ERROR:",e);
        res.status(500).json({success:false,message:"Unable to load training groups."});
    }
});

router.post("/groups",async(req,res)=>{
    try{
        const user=await auth(req,res);
        if(!user||!adminOnly(user,res))return;

        const {program_id,name,description,facilitator_name}=req.body||{};

        if(!program_id||!String(name||"").trim()){
            return res.status(400).json({
                success:false,
                message:"Program and group name are required."
            });
        }

        const {rows}=await pool.query(`
            INSERT INTO training_groups
            (program_id,name,description,facilitator_name)
            VALUES($1,$2,$3,$4)
            RETURNING *
        `,[
            program_id,
            String(name).trim(),
            description||null,
            facilitator_name||null
        ]);

        res.status(201).json({
            success:true,
            message:"Training group created successfully.",
            group:rows[0]
        });
    }catch(e){
        console.error("CREATE TRAINING GROUP ERROR:",e);
        res.status(500).json({success:false,message:"Unable to create training group."});
    }
});

router.post("/groups/:groupId/members",async(req,res)=>{
    try{
        const user=await auth(req,res);
        if(!user||!adminOnly(user,res))return;

        const staff_id=req.body?.staff_id;

        if(!staff_id){
            return res.status(400).json({
                success:false,
                message:"Staff member is required."
            });
        }

        const {rows}=await pool.query(`
            INSERT INTO training_group_members(group_id,staff_id)
            VALUES($1,$2)
            ON CONFLICT(group_id,staff_id)
            DO NOTHING
            RETURNING *
        `,[req.params.groupId,staff_id]);

        res.status(201).json({
            success:true,
            message:rows.length?"Staff member added to group.":"Staff member is already in this group.",
            member:rows[0]||null
        });
    }catch(e){
        console.error("ADD TRAINING GROUP MEMBER ERROR:",e);
        res.status(500).json({success:false,message:"Unable to add staff member to group."});
    }
});

router.get("/groups/:groupId/members",async(req,res)=>{
    try{
        const user=await auth(req,res);
        if(!user)return;

        const {rows}=await pool.query(`
            SELECT
                tgm.id,
                tgm.group_id,
                tgm.staff_id,
                COALESCE(u.full_name,sp.full_name,'Staff') staff_name,
                COALESCE(u.email,sp.email) email,
                u.position,
                u.department
            FROM training_group_members tgm
            JOIN staff s ON s.id=tgm.staff_id
            LEFT JOIN users u ON u.id=s.user_id
            LEFT JOIN staff_profiles sp ON sp.user_id=s.user_id
            WHERE tgm.group_id=$1
            ORDER BY staff_name
        `,[req.params.groupId]);

        res.json({success:true,members:rows});
    }catch(e){
        console.error("GET TRAINING GROUP MEMBERS ERROR:",e);
        res.status(500).json({success:false,message:"Unable to load group members."});
    }
});

/* ============================================================
   ATTENDANCE
============================================================ */

router.post("/attendance",async(req,res)=>{
    try{
        const user=await auth(req,res);
        if(!user)return;

        const sid=user.isAdmin&&req.body?.staff_id
            ? req.body.staff_id
            : await staffId(user);

        if(!sid){
            return res.status(404).json({
                success:false,
                message:"Staff profile could not be found."
            });
        }

        const {session_id,status,joined_at,left_at,minutes_attended,notes}=req.body||{};
        const s=String(status||"PRESENT").toUpperCase();

        if(!session_id||!valid(s,ATTENDANCE_STATUS)){
            return res.status(400).json({
                success:false,
                message:"Session and valid attendance status are required."
            });
        }

        const {rows}=await pool.query(`
            INSERT INTO training_attendance
            (session_id,staff_id,status,joined_at,left_at,minutes_attended,notes)
            VALUES($1,$2,$3,$4,$5,$6,$7)
            ON CONFLICT(session_id,staff_id)
            DO UPDATE SET
                status=EXCLUDED.status,
                joined_at=EXCLUDED.joined_at,
                left_at=EXCLUDED.left_at,
                minutes_attended=EXCLUDED.minutes_attended,
                notes=EXCLUDED.notes,
                updated_at=NOW()
            RETURNING *
        `,[
            session_id,
            sid,
            s,
            joined_at||new Date().toISOString(),
            left_at||null,
            minutes_attended||null,
            notes||null
        ]);

        res.status(201).json({
            success:true,
            message:"Training attendance recorded.",
            attendance:rows[0]
        });
    }catch(e){
        console.error("TRAINING ATTENDANCE ERROR:",e);
        res.status(500).json({success:false,message:"Unable to record attendance."});
    }
});

router.get("/attendance/:sessionId",async(req,res)=>{
    try{
        const user=await auth(req,res);
        if(!user||!adminOnly(user,res))return;

        const {rows}=await pool.query(`
            SELECT
                ta.*,
                COALESCE(u.full_name,sp.full_name,'Staff') staff_name,
                COALESCE(u.email,sp.email) email
            FROM training_attendance ta
            JOIN staff s ON s.id=ta.staff_id
            LEFT JOIN users u ON u.id=s.user_id
            LEFT JOIN staff_profiles sp ON sp.user_id=s.user_id
            WHERE ta.session_id=$1
            ORDER BY staff_name
        `,[req.params.sessionId]);

        res.json({success:true,attendance:rows});
    }catch(e){
        console.error("GET TRAINING ATTENDANCE ERROR:",e);
        res.status(500).json({success:false,message:"Unable to load attendance."});
    }
});

/* ============================================================
   MATERIALS / TRAINING PACKAGES
============================================================ */

router.get("/materials",async(req,res)=>{
    try{
        const user=await auth(req,res);
        if(!user)return;

        const {program_id,session_id,type,search}=req.query;
        const params=[];
        const where=[];

        if(program_id){
            params.push(program_id);
            where.push(`tm.program_id=$${params.length}`);
        }

        if(session_id){
            params.push(session_id);
            where.push(`tm.session_id=$${params.length}`);
        }

        if(type){
            params.push(String(type).toUpperCase());
            where.push(`UPPER(tm.material_type)=$${params.length}`);
        }

        if(search){
            params.push(`%${String(search).trim()}%`);
            where.push(`(
                tm.title ILIKE $${params.length}
                OR COALESCE(tm.description,'') ILIKE $${params.length}
            )`);
        }

        const {rows}=await pool.query(`
            SELECT tm.*,tp.title program_title
            FROM training_materials tm
            LEFT JOIN training_programs tp ON tp.id=tm.program_id
            ${where.length?"WHERE "+where.join(" AND "):""}
            ORDER BY tm.created_at DESC
        `,params);

        res.json({success:true,materials:rows});
    }catch(e){
        console.error("GET TRAINING MATERIALS ERROR:",e);
        res.status(500).json({success:false,message:"Unable to load training materials."});
    }
});

router.post("/materials",async(req,res)=>{
    try{
        const user=await auth(req,res);
        if(!user||!adminOnly(user,res))return;

        const b=req.body||{};

        if(!String(b.title||"").trim()){
            return res.status(400).json({
                success:false,
                message:"Material title is required."
            });
        }

        const {rows}=await pool.query(`
            INSERT INTO training_materials
            (program_id,session_id,title,description,material_type,
             file_name,file_path,file_type,file_size,external_url,uploaded_by)
            VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
            RETURNING *
        `,[
            b.program_id||null,
            b.session_id||null,
            String(b.title).trim(),
            b.description||null,
            b.material_type||"DOCUMENT",
            b.file_name||null,
            b.file_path||null,
            b.file_type||null,
            b.file_size||null,
            b.external_url||null,
            user.id
        ]);

        res.status(201).json({
            success:true,
            message:"Training material added successfully.",
            material:rows[0]
        });
    }catch(e){
        console.error("CREATE TRAINING MATERIAL ERROR:",e);
        res.status(500).json({success:false,message:"Unable to add training material."});
    }
});

/* ============================================================
   MY CERTIFICATES
============================================================ */

router.get("/certificates",async(req,res)=>{
    try{
        const user=await auth(req,res);
        if(!user)return;

        const sid=await staffId(user);

        if(!sid){
            return res.json({success:true,certificates:[]});
        }

        const {rows}=await pool.query(`
            SELECT
                tc.*,
                tp.title program_title,
                tp.category
            FROM training_certificates tc
            JOIN training_programs tp ON tp.id=tc.program_id
            WHERE tc.staff_id=$1
            ORDER BY tc.issued_date DESC
        `,[sid]);

        res.json({success:true,certificates:rows});
    }catch(e){
        console.error("GET TRAINING CERTIFICATES ERROR:",e);
        res.status(500).json({success:false,message:"Unable to load certificates."});
    }
});

router.post("/certificates",async(req,res)=>{
    try{
        const user=await auth(req,res);
        if(!user||!adminOnly(user,res))return;

        const b=req.body||{};

        if(!b.program_id||!b.staff_id||!String(b.title||"").trim()){
            return res.status(400).json({
                success:false,
                message:"Program, staff member and certificate title are required."
            });
        }

        const certificateNumber=
            String(b.certificate_number||`KCS-TR-${Date.now()}`).trim();

        const verificationCode=
            String(b.verification_code||certificateNumber).trim();

        const {rows}=await pool.query(`
            INSERT INTO training_certificates
            (program_id,staff_id,certificate_number,title,issued_date,
             expiry_date,issuer,certificate_url,file_name,file_path,
             verification_code,status)
            VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
            RETURNING *
        `,[
            b.program_id,
            b.staff_id,
            certificateNumber,
            String(b.title).trim(),
            b.issued_date||new Date().toISOString().slice(0,10),
            b.expiry_date||null,
            b.issuer||"Kenbridge Christian School",
            b.certificate_url||null,
            b.file_name||null,
            b.file_path||null,
            verificationCode,
            b.status||"ACTIVE"
        ]);

        res.status(201).json({
            success:true,
            message:"Training certificate issued successfully.",
            certificate:rows[0]
        });
    }catch(e){
        console.error("CREATE TRAINING CERTIFICATE ERROR:",e);
        res.status(500).json({success:false,message:"Unable to issue certificate."});
    }
});

/* ============================================================
   TRAINING NOTIFICATIONS
============================================================ */

router.get("/notifications",async(req,res)=>{
    try{
        const user=await auth(req,res);
        if(!user)return;

        const sid=await staffId(user);

        if(!sid){
            return res.json({
                success:true,
                notifications:[],
                unreadCount:0
            });
        }

        const {rows}=await pool.query(`
            SELECT
                tn.*,
                tp.title program_title,
                ts.title session_title
            FROM training_notifications tn
            LEFT JOIN training_programs tp ON tp.id=tn.program_id
            LEFT JOIN training_sessions ts ON ts.id=tn.session_id
            WHERE tn.staff_id=$1
            ORDER BY tn.created_at DESC
        `,[sid]);

        res.json({
            success:true,
            notifications:rows,
            unreadCount:rows.filter(x=>!x.is_read).length
        });
    }catch(e){
        console.error("GET TRAINING NOTIFICATIONS ERROR:",e);
        res.status(500).json({success:false,message:"Unable to load training notifications."});
    }
});

router.patch("/notifications/:id/read",async(req,res)=>{
    try{
        const user=await auth(req,res);
        if(!user)return;

        const sid=await staffId(user);

        const {rows}=await pool.query(`
            UPDATE training_notifications
            SET is_read=TRUE
            WHERE id=$1 AND staff_id=$2
            RETURNING *
        `,[req.params.id,sid]);

        if(!rows.length){
            return res.status(404).json({
                success:false,
                message:"Training notification was not found."
            });
        }

        res.json({
            success:true,
            message:"Notification marked as read.",
            notification:rows[0]
        });
    }catch(e){
        console.error("READ TRAINING NOTIFICATION ERROR:",e);
        res.status(500).json({success:false,message:"Unable to update notification."});
    }
});

router.patch("/notifications/read-all",async(req,res)=>{
    try{
        const user=await auth(req,res);
        if(!user)return;

        const sid=await staffId(user);

        const result=await pool.query(`
            UPDATE training_notifications
            SET is_read=TRUE
            WHERE staff_id=$1 AND is_read=FALSE
        `,[sid]);

        res.json({
            success:true,
            message:"Training notifications marked as read.",
            updatedCount:result.rowCount
        });
    }catch(e){
        console.error("READ ALL TRAINING NOTIFICATIONS ERROR:",e);
        res.status(500).json({success:false,message:"Unable to update notifications."});
    }
});

router.post("/notifications",async(req,res)=>{
    try{
        const user=await auth(req,res);
        if(!user||!adminOnly(user,res))return;

        const b=req.body||{};

        if(!String(b.title||"").trim()||!String(b.message||"").trim()){
            return res.status(400).json({
                success:false,
                message:"Notification title and message are required."
            });
        }

        const {rows}=await pool.query(`
            INSERT INTO training_notifications
            (staff_id,program_id,session_id,title,message,notification_type)
            VALUES($1,$2,$3,$4,$5,$6)
            RETURNING *
        `,[
            b.staff_id||null,
            b.program_id||null,
            b.session_id||null,
            String(b.title).trim(),
            String(b.message).trim(),
            b.notification_type||"GENERAL"
        ]);

        res.status(201).json({
            success:true,
            message:"Training notification created.",
            notification:rows[0]
        });
    }catch(e){
        console.error("CREATE TRAINING NOTIFICATION ERROR:",e);
        res.status(500).json({success:false,message:"Unable to create training notification."});
    }
});

/* ============================================================
   FEEDBACK
============================================================ */

router.post("/feedback",async(req,res)=>{
    try{
        const user=await auth(req,res);
        if(!user)return;

        const sid=await staffId(user);

        if(!sid){
            return res.status(404).json({
                success:false,
                message:"Staff profile could not be found."
            });
        }

        const {program_id,session_id,rating,comments,suggestions}=req.body||{};

        if(!program_id){
            return res.status(400).json({
                success:false,
                message:"Training program is required."
            });
        }

        if(rating!=null&&(Number(rating)<1||Number(rating)>5)){
            return res.status(400).json({
                success:false,
                message:"Rating must be between 1 and 5."
            });
        }

        const {rows}=await pool.query(`
            INSERT INTO training_feedback
            (program_id,session_id,staff_id,rating,comments,suggestions)
            VALUES($1,$2,$3,$4,$5,$6)
            ON CONFLICT(program_id,staff_id)
            DO UPDATE SET
                session_id=EXCLUDED.session_id,
                rating=EXCLUDED.rating,
                comments=EXCLUDED.comments,
                suggestions=EXCLUDED.suggestions
            RETURNING *
        `,[
            program_id,
            session_id||null,
            sid,
            rating==null?null:Number(rating),
            comments||null,
            suggestions||null
        ]);

        res.status(201).json({
            success:true,
            message:"Training feedback saved successfully.",
            feedback:rows[0]
        });
    }catch(e){
        console.error("TRAINING FEEDBACK ERROR:",e);
        res.status(500).json({success:false,message:"Unable to save training feedback."});
    }
});

/* ============================================================
   ADMIN STAFF LIST FOR TRAINING ASSIGNMENTS
============================================================ */

router.get("/admin/staff",async(req,res)=>{
    try{
        const user=await auth(req,res);
        if(!user||!adminOnly(user,res))return;

        const {rows}=await pool.query(`
            SELECT
                s.id staff_id,
                s.user_id,
                COALESCE(u.full_name,sp.full_name,'Staff') full_name,
                COALESCE(u.email,sp.email) email,
                COALESCE(u.position,sp.position) position,
                COALESCE(u.department,sp.department) department,
                u.phone
            FROM staff s
            LEFT JOIN users u ON u.id=s.user_id
            LEFT JOIN staff_profiles sp ON sp.user_id=s.user_id
            WHERE COALESCE(u.is_active,sp.is_active,TRUE)=TRUE
            ORDER BY full_name
        `);

        res.json({success:true,staff:rows});
    }catch(e){
        console.error("GET TRAINING STAFF ERROR:",e);
        res.status(500).json({success:false,message:"Unable to load staff list."});
    }
});

module.exports=router;
