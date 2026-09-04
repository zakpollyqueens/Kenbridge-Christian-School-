const express=require("express");
const multer=require("multer");
const crypto=require("crypto");
const {createClient}=require("@supabase/supabase-js");
const pool=require("../db");
const router=express.Router();

const supabase=createClient(process.env.SUPABASE_URL,process.env.SUPABASE_SECRET_KEY);
const BUCKET="staff-resources";
const upload=multer({storage:multer.memoryStorage(),limits:{fileSize:25*1024*1024}});

async function auth(req,res,next){
  try{
    const h=req.headers.authorization||"";
    if(!h.startsWith("Bearer "))return res.status(401).json({error:"Authentication required"});
    const token=h.slice(7);
    const {data,error}=await supabase.auth.getUser(token);
    if(error||!data?.user)return res.status(401).json({error:"Invalid authentication token"});
    const {rows}=await pool.query("SELECT * FROM users WHERE id=$1 LIMIT 1",[data.user.id]);
    if(!rows[0])return res.status(403).json({error:"User account not found"});
    if(rows[0].status&&String(rows[0].status).toUpperCase()!=="ACTIVE")return res.status(403).json({error:"Account is inactive"});
    const role=String(rows[0].role||"").toUpperCase();
    if(!["STAFF","ADMIN"].includes(role))return res.status(403).json({error:"Staff access required"});
    req.user={...rows[0],authUser:data.user};
    next();
  }catch(e){console.error("Training auth:",e);res.status(500).json({error:"Authentication failed"});}
}
function adminOnly(req,res,next){
  if(String(req.user?.role||"").toUpperCase()!=="ADMIN")return res.status(403).json({error:"Administrator access required"});
  next();
}
async function staffId(user){
  const {rows}=await pool.query("SELECT id FROM staff WHERE user_id=$1 LIMIT 1",[user.id]);
  return rows[0]?.id||null;
}
function safeName(n){
  return String(n||"file").replace(/[^a-zA-Z0-9._-]/g,"_").slice(-150);
}
function filePath(folder,file){
  return `${folder}/${Date.now()}-${crypto.randomBytes(6).toString("hex")}-${safeName(file.originalname)}`;
}
async function signed(path){
  if(!path)return null;
  const {data,error}=await supabase.storage.from(BUCKET).createSignedUrl(path,3600);
  return error?null:data?.signedUrl||null;
}
async function notifyAll(title,message,type="GENERAL",programId=null,sessionId=null){
  const {rows}=await pool.query("SELECT id FROM staff WHERE employment_status IS NULL OR UPPER(employment_status) NOT IN ('INACTIVE','TERMINATED','LEFT')",[]);
  if(!rows.length)return;
  for(const s of rows){
    await pool.query(
      `INSERT INTO training_notifications(staff_id,program_id,session_id,title,message,notification_type)
       VALUES($1,$2,$3,$4,$5,$6)`,
      [s.id,programId,sessionId,title,message,type]
    );
  }
}
async function notifyStaff(staffIds,title,message,type="GENERAL",programId=null,sessionId=null){
  for(const id of [...new Set((staffIds||[]).filter(Boolean))]){
    await pool.query(
      `INSERT INTO training_notifications(staff_id,program_id,session_id,title,message,notification_type)
       VALUES($1,$2,$3,$4,$5,$6)`,
      [id,programId,sessionId,title,message,type]
    );
  }
}

/* DASHBOARD */
router.get("/dashboard",auth,async(req,res)=>{
  try{
    const sid=await staffId(req.user);
    const [p,a,c,n,s]=await Promise.all([
      pool.query(`SELECT COUNT(*)::int count FROM training_programs WHERE status IN('UPCOMING','ONGOING')`),
      sid?pool.query(`SELECT COUNT(*)::int count FROM training_enrollments WHERE staff_id=$1 AND status IN('ENROLLED','IN_PROGRESS')`,[sid]):{rows:[{count:0}]},
      sid?pool.query(`SELECT COUNT(*)::int count FROM training_certificates WHERE staff_id=$1 AND status='ACTIVE'`,[sid]):{rows:[{count:0}]},
      sid?pool.query(`SELECT COUNT(*)::int count FROM training_notifications WHERE staff_id=$1 AND is_read=false`,[sid]):{rows:[{count:0}]},
      pool.query(`SELECT COUNT(*)::int count FROM training_sessions WHERE session_date>=NOW() AND status IN('SCHEDULED','LIVE')`)
    ]);
    res.json({activePrograms:p.rows[0].count,myActiveTraining:a.rows[0].count,certificates:c.rows[0].count,unreadNotifications:n.rows[0].count,upcomingSessions:s.rows[0].count});
  }catch(e){console.error(e);res.status(500).json({error:"Failed to load training dashboard"});}
});

/* PROGRAMS */
router.get("/programs",auth,async(req,res)=>{
  try{
    const {status,category,search}=req.query;
    let q=`SELECT * FROM training_programs WHERE 1=1`,v=[];
    if(status){v.push(status);q+=` AND status=$${v.length}`;}
    if(category){v.push(category);q+=` AND category=$${v.length}`;}
    if(search){v.push(`%${search}%`);q+=` AND(title ILIKE $${v.length} OR description ILIKE $${v.length} OR category ILIKE $${v.length})`;}
    q+=" ORDER BY start_date ASC NULLS LAST,created_at DESC";
    res.json((await pool.query(q,v)).rows);
  }catch(e){console.error(e);res.status(500).json({error:"Failed to load training programs"});}
});

router.get("/programs/:id",auth,async(req,res)=>{
  try{
    const id=req.params.id;
    const p=(await pool.query("SELECT * FROM training_programs WHERE id=$1",[id])).rows[0];
    if(!p)return res.status(404).json({error:"Training program not found"});
    const [sessions,groups,materials]=await Promise.all([
      pool.query("SELECT * FROM training_sessions WHERE program_id=$1 ORDER BY session_date ASC",[id]),
      pool.query("SELECT * FROM training_groups WHERE program_id=$1 ORDER BY name",[id]),
      pool.query("SELECT * FROM training_materials WHERE program_id=$1 ORDER BY created_at DESC",[id])
    ]);
    for(const m of materials.rows)m.signed_url=await signed(m.file_path);
    res.json({...p,sessions:sessions.rows,groups:groups.rows,materials:materials.rows});
  }catch(e){console.error(e);res.status(500).json({error:"Failed to load program"});}
});

router.post("/programs",auth,adminOnly,async(req,res)=>{
  try{
    const x=req.body||{};
    const r=await pool.query(
      `INSERT INTO training_programs(title,description,category,trainer_name,trainer_organization,start_date,end_date,duration_minutes,required,status,cover_image,created_by)
       VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING *`,
      [x.title,x.description||null,x.category||"Professional Development",x.trainer_name||null,x.trainer_organization||null,x.start_date||null,x.end_date||null,x.duration_minutes||null,!!x.required,x.status||"DRAFT",x.cover_image||null,req.user.id]
    );
    const p=r.rows[0];
    if(p.required)await notifyAll("Required Training",`A required training program has been created: ${p.title}. Please check the Training Center for details.`,"REQUIRED",p.id,null);
    res.status(201).json(p);
  }catch(e){console.error(e);res.status(500).json({error:"Failed to create training program"});}
});

router.patch("/programs/:id",auth,adminOnly,async(req,res)=>{
  try{
    const x=req.body||{},fields=["title","description","category","trainer_name","trainer_organization","start_date","end_date","duration_minutes","required","status","cover_image"];
    let sets=[],v=[];
    for(const f of fields)if(x[f]!==undefined){v.push(x[f]);sets.push(`${f}=$${v.length}`);}
    if(!sets.length)return res.status(400).json({error:"No changes supplied"});
    v.push(req.params.id);
    const r=await pool.query(`UPDATE training_programs SET ${sets.join(",")},updated_at=NOW() WHERE id=$${v.length} RETURNING *`,v);
    if(!r.rows[0])return res.status(404).json({error:"Training program not found"});
    res.json(r.rows[0]);
  }catch(e){console.error(e);res.status(500).json({error:"Failed to update program"});}
});

router.delete("/programs/:id",auth,adminOnly,async(req,res)=>{
  try{
    const r=await pool.query("DELETE FROM training_programs WHERE id=$1 RETURNING id",[req.params.id]);
    if(!r.rows[0])return res.status(404).json({error:"Training program not found"});
    res.json({success:true});
  }catch(e){console.error(e);res.status(500).json({error:"Failed to delete program"});}
});

/* SESSIONS */
router.get("/sessions",auth,async(req,res)=>{
  try{
    const {program_id,status}=req.query;
    let q=`SELECT s.*,p.title program_title FROM training_sessions s LEFT JOIN training_programs p ON p.id=s.program_id WHERE 1=1`,v=[];
    if(program_id){v.push(program_id);q+=` AND s.program_id=$${v.length}`;}
    if(status){v.push(status);q+=` AND s.status=$${v.length}`;}
    q+=" ORDER BY s.session_date ASC";
    res.json((await pool.query(q,v)).rows);
  }catch(e){console.error(e);res.status(500).json({error:"Failed to load sessions"});}
});

router.get("/sessions/upcoming",auth,async(req,res)=>{
  try{
    res.json((await pool.query(
      `SELECT s.*,p.title program_title,p.category FROM training_sessions s
       LEFT JOIN training_programs p ON p.id=s.program_id
       WHERE s.session_date>=NOW() AND s.status IN('SCHEDULED','LIVE')
       ORDER BY s.session_date ASC LIMIT 20`
    )).rows);
  }catch(e){console.error(e);res.status(500).json({error:"Failed to load upcoming sessions"});}
});

router.post("/sessions",auth,adminOnly,async(req,res)=>{
  try{
    const x=req.body||{};
    if(!x.title||!x.session_date)return res.status(400).json({error:"Title and session date are required"});
    const r=await pool.query(
      `INSERT INTO training_sessions(program_id,title,description,session_date,end_date,location,meeting_type,meeting_url,meeting_id,meeting_password,recording_url,materials_url,trainer_name,status)
       VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) RETURNING *`,
      [x.program_id||null,x.title,x.description||null,x.session_date,x.end_date||null,x.location||null,x.meeting_type||"PHYSICAL",x.meeting_url||null,x.meeting_id||null,x.meeting_password||null,x.recording_url||null,x.materials_url||null,x.trainer_name||null,x.status||"SCHEDULED"]
    );
    const s=r.rows[0];
    await notifyAll("Upcoming Training Session",`${s.title} is scheduled for ${new Date(s.session_date).toLocaleString()}. Check the Training Center for meeting details.`,"UPCOMING",s.program_id,s.id);
    if(["ZOOM","GOOGLE_MEET","ONLINE","HYBRID"].includes(String(s.meeting_type).toUpperCase()))
      await notifyAll("Online Training Meeting",`${s.title} includes an online meeting. Open the Training Center to join.`,"ZOOM",s.program_id,s.id);
    res.status(201).json(s);
  }catch(e){console.error(e);res.status(500).json({error:"Failed to create session"});}
});

router.patch("/sessions/:id",auth,adminOnly,async(req,res)=>{
  try{
    const x=req.body||{},fields=["program_id","title","description","session_date","end_date","location","meeting_type","meeting_url","meeting_id","meeting_password","recording_url","materials_url","trainer_name","status"];
    let sets=[],v=[];
    for(const f of fields)if(x[f]!==undefined){v.push(x[f]);sets.push(`${f}=$${v.length}`);}
    if(!sets.length)return res.status(400).json({error:"No changes supplied"});
    v.push(req.params.id);
    const r=await pool.query(`UPDATE training_sessions SET ${sets.join(",")},updated_at=NOW() WHERE id=$${v.length} RETURNING *`,v);
    if(!r.rows[0])return res.status(404).json({error:"Session not found"});
    res.json(r.rows[0]);
  }catch(e){console.error(e);res.status(500).json({error:"Failed to update session"});}
});

/* MY TRAINING */
router.get("/my-training",auth,async(req,res)=>{
  try{
    const sid=await staffId(req.user);
    if(!sid)return res.status(404).json({error:"Staff profile could not be found"});
    const r=await pool.query(
      `SELECT e.*,p.title,p.description,p.category,p.trainer_name,p.start_date,p.end_date,p.required
       FROM training_enrollments e JOIN training_programs p ON p.id=e.program_id
       WHERE e.staff_id=$1 ORDER BY p.start_date DESC NULLS LAST,e.created_at DESC`,[sid]
    );
    res.json(r.rows);
  }catch(e){console.error(e);res.status(500).json({error:"Failed to load your training"});}
});

router.post("/enroll",auth,async(req,res)=>{
  try{
    const sid=await staffId(req.user);
    if(!sid)return res.status(404).json({error:"Staff profile could not be found"});
    const {program_id}=req.body||{};
    if(!program_id)return res.status(400).json({error:"program_id is required"});
    const r=await pool.query(
      `INSERT INTO training_enrollments(program_id,staff_id,status,enrolled_at)
       VALUES($1,$2,'ENROLLED',NOW())
       ON CONFLICT(program_id,staff_id) DO UPDATE SET status='ENROLLED',updated_at=NOW()
       RETURNING *`,[program_id,sid]
    );
    res.status(201).json(r.rows[0]);
  }catch(e){console.error(e);res.status(500).json({error:"Failed to enroll"});}
});

router.post("/enrollments",auth,adminOnly,async(req,res)=>{
  try{
    const x=req.body||{};
    const r=await pool.query(
      `INSERT INTO training_enrollments(program_id,staff_id,group_id,status,enrolled_at,progress,score,notes)
       VALUES($1,$2,$3,$4,NOW(),$5,$6,$7)
       ON CONFLICT(program_id,staff_id) DO UPDATE SET group_id=EXCLUDED.group_id,status=EXCLUDED.status,progress=EXCLUDED.progress,score=EXCLUDED.score,notes=EXCLUDED.notes,updated_at=NOW()
       RETURNING *`,
      [x.program_id,x.staff_id,x.group_id||null,x.status||"ENROLLED",x.progress||0,x.score||null,x.notes||null]
    );
    if(x.staff_id)await notifyStaff([x.staff_id],"Training Assignment",`You have been assigned to a training program. Open Training Center to view it.`,"REQUIRED",x.program_id,null);
    res.status(201).json(r.rows[0]);
  }catch(e){console.error(e);res.status(500).json({error:"Failed to assign training"});}
});

router.get("/enrollments/:programId",auth,adminOnly,async(req,res)=>{
  try{
    res.json((await pool.query(
      `SELECT e.*,s.staff_number,s.first_name,s.last_name,s.department,s.job_title
       FROM training_enrollments e JOIN staff s ON s.id=e.staff_id
       WHERE e.program_id=$1 ORDER BY s.first_name,s.last_name`,[req.params.programId]
    )).rows);
  }catch(e){console.error(e);res.status(500).json({error:"Failed to load enrollments"});}
});

/* GROUPS */
router.get("/groups/:programId",auth,async(req,res)=>{
  try{
    res.json((await pool.query("SELECT * FROM training_groups WHERE program_id=$1 ORDER BY name",[req.params.programId])).rows);
  }catch(e){console.error(e);res.status(500).json({error:"Failed to load groups"});}
});

router.post("/groups",auth,adminOnly,async(req,res)=>{
  try{
    const x=req.body||{};
    const r=await pool.query(
      `INSERT INTO training_groups(program_id,name,description,facilitator_name)
       VALUES($1,$2,$3,$4) RETURNING *`,
      [x.program_id,x.name,x.description||null,x.facilitator_name||null]
    );
    res.status(201).json(r.rows[0]);
  }catch(e){console.error(e);res.status(500).json({error:"Failed to create group"});}
});

router.post("/groups/:groupId/members",auth,adminOnly,async(req,res)=>{
  try{
    const ids=Array.isArray(req.body?.staff_ids)?req.body.staff_ids:[req.body?.staff_id];
    const out=[];
    for(const sid of ids.filter(Boolean)){
      const r=await pool.query(
        `INSERT INTO training_group_members(group_id,staff_id)
         VALUES($1,$2) ON CONFLICT(group_id,staff_id) DO NOTHING RETURNING *`,
        [req.params.groupId,sid]
      );
      if(r.rows[0])out.push(r.rows[0]);
    }
    const g=(await pool.query("SELECT program_id,name FROM training_groups WHERE id=$1",[req.params.groupId])).rows[0];
    if(g)await notifyStaff(ids.filter(Boolean),"Workshop Group Assignment",`You have been assigned to workshop group "${g.name}".`,"GROUP_ASSIGNMENT",g.program_id,null);
    res.status(201).json(out);
  }catch(e){console.error(e);res.status(500).json({error:"Failed to add group members"});}
});

router.get("/groups/:groupId/members",auth,async(req,res)=>{
  try{
    res.json((await pool.query(
      `SELECT gm.*,s.staff_number,s.first_name,s.last_name,s.department,s.job_title
       FROM training_group_members gm JOIN staff s ON s.id=gm.staff_id
       WHERE gm.group_id=$1 ORDER BY s.first_name,s.last_name`,[req.params.groupId]
    )).rows);
  }catch(e){console.error(e);res.status(500).json({error:"Failed to load group members"});}
});

/* ATTENDANCE */
router.post("/attendance",auth,async(req,res)=>{
  try{
    const sid=String(req.user.role).toUpperCase()==="ADMIN"&&req.body?.staff_id?req.body.staff_id:await staffId(req.user);
    if(!sid)return res.status(404).json({error:"Staff profile could not be found"});
    const x=req.body||{};
    const r=await pool.query(
      `INSERT INTO training_attendance(session_id,staff_id,status,joined_at,left_at,minutes_attended,notes)
       VALUES($1,$2,$3,$4,$5,$6,$7)
       ON CONFLICT(session_id,staff_id) DO UPDATE SET status=EXCLUDED.status,joined_at=EXCLUDED.joined_at,left_at=EXCLUDED.left_at,minutes_attended=EXCLUDED.minutes_attended,notes=EXCLUDED.notes,updated_at=NOW()
       RETURNING *`,
      [x.session_id,sid,x.status||"PRESENT",x.joined_at||new Date(),x.left_at||null,x.minutes_attended||null,x.notes||null]
    );
    res.status(201).json(r.rows[0]);
  }catch(e){console.error(e);res.status(500).json({error:"Failed to record attendance"});}
});

router.get("/attendance/:sessionId",auth,adminOnly,async(req,res)=>{
  try{
    res.json((await pool.query(
      `SELECT a.*,s.staff_number,s.first_name,s.last_name,s.department
       FROM training_attendance a JOIN staff s ON s.id=a.staff_id
       WHERE a.session_id=$1 ORDER BY s.first_name,s.last_name`,[req.params.sessionId]
    )).rows);
  }catch(e){console.error(e);res.status(500).json({error:"Failed to load attendance"});}
});

/* TRAINING MATERIALS */
router.get("/materials",auth,async(req,res)=>{
  try{
    const {program_id,session_id,material_type,search}=req.query;
    let q=`SELECT * FROM training_materials WHERE 1=1`,v=[];
    if(program_id){v.push(program_id);q+=` AND program_id=$${v.length}`;}
    if(session_id){v.push(session_id);q+=` AND session_id=$${v.length}`;}
    if(material_type){v.push(material_type);q+=` AND material_type=$${v.length}`;}
    if(search){v.push(`%${search}%`);q+=` AND(title ILIKE $${v.length} OR description ILIKE $${v.length})`;}
    q+=" ORDER BY created_at DESC";
    const rows=(await pool.query(q,v)).rows;
    for(const m of rows)m.signed_url=await signed(m.file_path);
    res.json(rows);
  }catch(e){console.error(e);res.status(500).json({error:"Failed to load training materials"});}
});

router.post("/materials",auth,adminOnly,async(req,res)=>{
  try{
    const x=req.body||{};
    const r=await pool.query(
      `INSERT INTO training_materials(program_id,session_id,title,description,material_type,external_url,uploaded_by)
       VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [x.program_id||null,x.session_id||null,x.title,x.description||null,x.material_type||"OTHER",x.external_url||null,req.user.id]
    );
    res.status(201).json(r.rows[0]);
  }catch(e){console.error(e);res.status(500).json({error:"Failed to add material"});}
});

router.post("/materials/upload",auth,adminOnly,upload.single("file"),async(req,res)=>{
  try{
    if(!req.file)return res.status(400).json({error:"Training file is required"});
    const x=req.body||{};
    if(!x.title)return res.status(400).json({error:"Material title is required"});
    const path=filePath(`training/${x.program_id||"general"}`,req.file);
    const up=await supabase.storage.from(BUCKET).upload(path,req.file.buffer,{contentType:req.file.mimetype||"application/octet-stream",upsert:false});
    if(up.error)return res.status(500).json({error:"Training file upload failed",details:up.error.message});
    const r=await pool.query(
      `INSERT INTO training_materials(program_id,session_id,title,description,material_type,file_name,file_path,file_type,file_size,uploaded_by)
       VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
      [x.program_id||null,x.session_id||null,x.title,x.description||null,x.material_type||"DOCUMENT",req.file.originalname,path,req.file.mimetype||null,req.file.size,req.user.id]
    );
    r.rows[0].signed_url=await signed(path);
    if(x.program_id)await notifyAll("New Training Package",`A new training package "${x.title}" is available in the Training Center.`,"MATERIAL",x.program_id,x.session_id||null);
    res.status(201).json(r.rows[0]);
  }catch(e){console.error(e);res.status(500).json({error:"Failed to upload training material"});}
});

router.delete("/materials/:id",auth,adminOnly,async(req,res)=>{
  try{
    const r=await pool.query("SELECT * FROM training_materials WHERE id=$1",[req.params.id]);
    const m=r.rows[0];
    if(!m)return res.status(404).json({error:"Material not found"});
    if(m.file_path)await supabase.storage.from(BUCKET).remove([m.file_path]);
    await pool.query("DELETE FROM training_materials WHERE id=$1",[req.params.id]);
    res.json({success:true});
  }catch(e){console.error(e);res.status(500).json({error:"Failed to delete material"});}
});

/* CERTIFICATES */
router.get("/certificates",auth,async(req,res)=>{
  try{
    const sid=await staffId(req.user);
    if(!sid)return res.status(404).json({error:"Staff profile could not be found"});
    const rows=(await pool.query(
      `SELECT c.*,p.title program_title FROM training_certificates c
       LEFT JOIN training_programs p ON p.id=c.program_id
       WHERE c.staff_id=$1 ORDER BY c.issued_date DESC`,[sid]
    )).rows;
    for(const c of rows)c.signed_url=await signed(c.file_path);
    res.json(rows);
  }catch(e){console.error(e);res.status(500).json({error:"Failed to load certificates"});}
});

router.post("/certificates",auth,adminOnly,upload.single("file"),async(req,res)=>{
  try{
    const x=req.body||{};
    if(!x.program_id||!x.staff_id||!x.title)return res.status(400).json({error:"program_id, staff_id and title are required"});
    let path=null,fileName=null;
    if(req.file){
      path=filePath(`training-certificates/${x.program_id}`,req.file);
      const up=await supabase.storage.from(BUCKET).upload(path,req.file.buffer,{contentType:req.file.mimetype||"application/octet-stream",upsert:false});
      if(up.error)return res.status(500).json({error:"Certificate upload failed",details:up.error.message});
      fileName=req.file.originalname;
    }
    const number=x.certificate_number||`KCS-${new Date().getFullYear()}-${crypto.randomBytes(5).toString("hex").toUpperCase()}`;
    const verify=x.verification_code||crypto.randomBytes(8).toString("hex").toUpperCase();
    const r=await pool.query(
      `INSERT INTO training_certificates(program_id,staff_id,certificate_number,title,issued_date,expiry_date,issuer,certificate_url,file_name,file_path,verification_code,status)
       VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,'ACTIVE') RETURNING *`,
      [x.program_id,x.staff_id,number,x.title,x.issued_date||new Date(),x.expiry_date||null,x.issuer||"Kenbridge Christian School",x.certificate_url||null,fileName,path,verify]
    );
    r.rows[0].signed_url=await signed(path);
    await notifyStaff([x.staff_id],"Certificate Issued",`Your training certificate "${x.title}" has been issued. Open the Certificates section in the Training Center.`,"CERTIFICATE",x.program_id,null);
    res.status(201).json(r.rows[0]);
  }catch(e){console.error(e);res.status(500).json({error:"Failed to issue certificate"});}
});

router.get("/certificates/verify/:code",async(req,res)=>{
  try{
    const r=await pool.query(
      `SELECT c.certificate_number,c.title,c.issued_date,c.expiry_date,c.issuer,c.status,p.title program_title,s.first_name,s.last_name
       FROM training_certificates c
       LEFT JOIN training_programs p ON p.id=c.program_id
       LEFT JOIN staff s ON s.id=c.staff_id
       WHERE c.verification_code=$1 LIMIT 1`,[req.params.code]
    );
    if(!r.rows[0])return res.status(404).json({valid:false,error:"Certificate not found"});
    const c=r.rows[0];
    const expired=c.expiry_date&&new Date(c.expiry_date)<new Date();
    res.json({valid:c.status==="ACTIVE"&&!expired,certificate:c});
  }catch(e){console.error(e);res.status(500).json({error:"Certificate verification failed"});}
});

/* NOTIFICATIONS */
router.get("/notifications",auth,async(req,res)=>{
  try{
    const sid=await staffId(req.user);
    if(!sid)return res.status(404).json({error:"Staff profile could not be found"});
    res.json((await pool.query(
      `SELECT * FROM training_notifications WHERE staff_id=$1 ORDER BY created_at DESC LIMIT 100`,[sid]
    )).rows);
  }catch(e){console.error(e);res.status(500).json({error:"Failed to load training notifications"});}
});

router.patch("/notifications/:id/read",auth,async(req,res)=>{
  try{
    const sid=await staffId(req.user);
    const r=await pool.query(
      `UPDATE training_notifications SET is_read=true WHERE id=$1 AND staff_id=$2 RETURNING *`,[req.params.id,sid]
    );
    if(!r.rows[0])return res.status(404).json({error:"Notification not found"});
    res.json(r.rows[0]);
  }catch(e){console.error(e);res.status(500).json({error:"Failed to update notification"});}
});

router.patch("/notifications/read-all",auth,async(req,res)=>{
  try{
    const sid=await staffId(req.user);
    await pool.query("UPDATE training_notifications SET is_read=true WHERE staff_id=$1",[sid]);
    res.json({success:true});
  }catch(e){console.error(e);res.status(500).json({error:"Failed to mark notifications read"});}
});

router.post("/notifications",auth,adminOnly,async(req,res)=>{
  try{
    const x=req.body||{};
    if(x.staff_id){
      const r=await pool.query(
        `INSERT INTO training_notifications(staff_id,program_id,session_id,title,message,notification_type)
         VALUES($1,$2,$3,$4,$5,$6) RETURNING *`,
        [x.staff_id,x.program_id||null,x.session_id||null,x.title,x.message,x.notification_type||"GENERAL"]
      );
      return res.status(201).json(r.rows[0]);
    }
    await notifyAll(x.title,x.message,x.notification_type||"GENERAL",x.program_id||null,x.session_id||null);
    res.status(201).json({success:true,broadcast:true});
  }catch(e){console.error(e);res.status(500).json({error:"Failed to send notification"});}
});

/* FEEDBACK */
router.post("/feedback",auth,async(req,res)=>{
  try{
    const sid=await staffId(req.user);
    if(!sid)return res.status(404).json({error:"Staff profile could not be found"});
    const x=req.body||{};
    const r=await pool.query(
      `INSERT INTO training_feedback(program_id,session_id,staff_id,rating,comments,suggestions)
       VALUES($1,$2,$3,$4,$5,$6)
       ON CONFLICT(program_id,staff_id) DO UPDATE SET session_id=EXCLUDED.session_id,rating=EXCLUDED.rating,comments=EXCLUDED.comments,suggestions=EXCLUDED.suggestions
       RETURNING *`,
      [x.program_id,x.session_id||null,sid,x.rating||null,x.comments||null,x.suggestions||null]
    );
    res.status(201).json(r.rows[0]);
  }catch(e){console.error(e);res.status(500).json({error:"Failed to save feedback"});}
});

router.get("/admin/staff",auth,adminOnly,async(req,res)=>{
  try{
    res.json((await pool.query(
      `SELECT id,staff_number,first_name,last_name,department,job_title,employment_status
       FROM staff
       WHERE employment_status IS NULL OR UPPER(employment_status) NOT IN('INACTIVE','TERMINATED','LEFT')
       ORDER BY first_name,last_name`
    )).rows);
  }catch(e){console.error(e);res.status(500).json({error:"Failed to load staff"});}
});

module.exports=router;
