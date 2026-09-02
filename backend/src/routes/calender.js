const express=require("express");
const supabase=require("../supabase");
const pool=require("../db");

const router=express.Router();

async function getAuthenticatedUser(req){
    const authorization=req.headers.authorization;

    if(!authorization?.startsWith("Bearer ")){
        throw new Error("Authorization token is required.");
    }

    const token=authorization.replace("Bearer ","");

    const {data,error}=await supabase.auth.getUser(token);

    if(error||!data?.user){
        throw new Error("Invalid or expired session.");
    }

    const {rows}=await pool.query(
        `SELECT id,full_name,role,is_active
         FROM users
         WHERE id=$1
         LIMIT 1`,
        [data.user.id]
    );

    const user=rows[0];

    if(!user){
        throw new Error("Staff profile was not found.");
    }

    if(!user.is_active){
        throw new Error("This account is inactive.");
    }

    return user;
}

function isAdmin(user){
    return String(user.role||"").toUpperCase()==="ADMIN";
}


/* =========================================================
   GET CALENDAR EVENTS
   GET /api/calendar
========================================================= */

router.get("/",async(req,res)=>{
    try{
        const user=await getAuthenticatedUser(req);

        const {rows}=await pool.query(
            `SELECT
                c.id,
                c.title,
                c.description,
                c.start_at,
                c.end_at,
                c.location,
                c.all_day,
                c.created_by,
                c.created_at,
                c.updated_at,
                u.full_name AS created_by_name
             FROM calendar_events c
             LEFT JOIN users u
                ON u.id=c.created_by
             ORDER BY c.start_at ASC`,
        );

        return res.status(200).json({
            success:true,
            events:rows
        });

    }catch(error){
        console.error("GET CALENDAR ERROR:",error.message);

        return res.status(401).json({
            success:false,
            message:error.message||"Unable to retrieve calendar events."
        });
    }
});


/* =========================================================
   CREATE CALENDAR EVENT
   POST /api/calendar
========================================================= */

router.post("/",async(req,res)=>{
    try{
        const user=await getAuthenticatedUser(req);

        const {
            title,
            description,
            start_at,
            end_at,
            location,
            all_day
        }=req.body||{};

        if(!title?.trim()){
            return res.status(400).json({
                success:false,
                message:"Event title is required."
            });
        }

        if(!start_at){
            return res.status(400).json({
                success:false,
                message:"Event start date and time are required."
            });
        }

        if(end_at && new Date(end_at)<new Date(start_at)){
            return res.status(400).json({
                success:false,
                message:"Event end time cannot be before the start time."
            });
        }

        const {rows}=await pool.query(
            `INSERT INTO calendar_events
                (
                    title,
                    description,
                    start_at,
                    end_at,
                    location,
                    all_day,
                    created_by
                )
             VALUES
                ($1,$2,$3,$4,$5,$6,$7)
             RETURNING *`,
            [
                String(title).trim(),
                description?.trim()||null,
                start_at,
                end_at||null,
                location?.trim()||null,
                Boolean(all_day),
                user.id
            ]
        );

        return res.status(201).json({
            success:true,
            message:"Calendar event created successfully.",
            event:rows[0]
        });

    }catch(error){
        console.error("CREATE CALENDAR ERROR:",error.message);

        return res.status(500).json({
            success:false,
            message:error.message||"Unable to create calendar event."
        });
    }
});


/* =========================================================
   UPDATE CALENDAR EVENT
   PUT /api/calendar/:id
========================================================= */

router.put("/:id",async(req,res)=>{
    try{
        const user=await getAuthenticatedUser(req);

        const {rows:eventRows}=await pool.query(
            `SELECT id,created_by
             FROM calendar_events
             WHERE id=$1
             LIMIT 1`,
            [req.params.id]
        );

        const event=eventRows[0];

        if(!event){
            return res.status(404).json({
                success:false,
                message:"Calendar event was not found."
            });
        }

        if(!isAdmin(user)&&event.created_by!==user.id){
            return res.status(403).json({
                success:false,
                message:"You do not have permission to edit this event."
            });
        }

        const {
            title,
            description,
            start_at,
            end_at,
            location,
            all_day
        }=req.body||{};

        if(!title?.trim()){
            return res.status(400).json({
                success:false,
                message:"Event title is required."
            });
        }

        if(!start_at){
            return res.status(400).json({
                success:false,
                message:"Event start date and time are required."
            });
        }

        if(end_at&&new Date(end_at)<new Date(start_at)){
            return res.status(400).json({
                success:false,
                message:"Event end time cannot be before the start time."
            });
        }

        const {rows}=await pool.query(
            `UPDATE calendar_events
             SET
                title=$1,
                description=$2,
                start_at=$3,
                end_at=$4,
                location=$5,
                all_day=$6,
                updated_at=NOW()
             WHERE id=$7
             RETURNING *`,
            [
                String(title).trim(),
                description?.trim()||null,
                start_at,
                end_at||null,
                location?.trim()||null,
                Boolean(all_day),
                req.params.id
            ]
        );

        return res.status(200).json({
            success:true,
            message:"Calendar event updated successfully.",
            event:rows[0]
        });

    }catch(error){
        console.error("UPDATE CALENDAR ERROR:",error.message);

        return res.status(500).json({
            success:false,
            message:error.message||"Unable to update calendar event."
        });
    }
});


/* =========================================================
   DELETE CALENDAR EVENT
   DELETE /api/calendar/:id
========================================================= */

router.delete("/:id",async(req,res)=>{
    try{
        const user=await getAuthenticatedUser(req);

        const {rows:eventRows}=await pool.query(
            `SELECT id,created_by
             FROM calendar_events
             WHERE id=$1
             LIMIT 1`,
            [req.params.id]
        );

        const event=eventRows[0];

        if(!event){
            return res.status(404).json({
                success:false,
                message:"Calendar event was not found."
            });
        }

        if(!isAdmin(user)&&event.created_by!==user.id){
            return res.status(403).json({
                success:false,
                message:"You do not have permission to delete this event."
            });
        }

        await pool.query(
            `DELETE FROM calendar_events
             WHERE id=$1`,
            [req.params.id]
        );

        return res.status(200).json({
            success:true,
            message:"Calendar event deleted successfully."
        });

    }catch(error){
        console.error("DELETE CALENDAR ERROR:",error.message);

        return res.status(500).json({
            success:false,
            message:error.message||"Unable to delete calendar event."
        });
    }
});

module.exports=router;
