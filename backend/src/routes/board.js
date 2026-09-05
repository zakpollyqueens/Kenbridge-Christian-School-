const express=require("express");
const crypto=require("crypto");
const supabase=require("../supabase");
const pool=require("../db");

const router=express.Router();
const BOARD_TOKEN_PREFIX="kbboard.";
const BOARD_TOKEN_TTL=8*60*60;
const BOARD_SESSION_SECRET=process.env.BOARD_SESSION_SECRET||process.env.SETUP_SECRET||process.env.BOARD_PORTAL_PASSWORD||"";

const b64=v=>Buffer.from(v).toString("base64url");
const safeEqual=(a,b)=>{
  const x=Buffer.from(String(a)),y=Buffer.from(String(b));
  return x.length===y.length&&crypto.timingSafeEqual(x,y);
};

function createBoardToken(user){
  if(!BOARD_SESSION_SECRET)throw Error("BOARD_SESSION_SECRET is not configured");
  const now=Math.floor(Date.now()/1000);
  const payload=b64(JSON.stringify({typ:"BOARD",sub:user.id,role:"ADMIN",iat:now,exp:now+BOARD_TOKEN_TTL}));
  const sig=crypto.createHmac("sha256",BOARD_SESSION_SECRET).update(payload).digest("base64url");
  return `${BOARD_TOKEN_PREFIX}${payload}.${sig}`;
}

function verifyBoardToken(token){
  if(!token?.startsWith(BOARD_TOKEN_PREFIX)||!BOARD_SESSION_SECRET)return null;
  const [payload,sig]=token.slice(BOARD_TOKEN_PREFIX.length).split(".");
  if(!payload||!sig)return null;
  const expected=crypto.createHmac("sha256",BOARD_SESSION_SECRET).update(payload).digest("base64url");
  if(!safeEqual(sig,expected))return null;
  try{
    const data=JSON.parse(Buffer.from(payload,"base64url").toString());
    return data.typ==="BOARD"&&data.role==="ADMIN"&&data.sub&&data.exp>=Date.now()/1000?data:null;
  }catch{return null}
}

async function loadKenbridgeUser(id){
  if(!id)return null;
  const{rows}=await pool.query(
    `SELECT id,email,full_name,username,role,is_active,position,department,phone FROM users WHERE id=$1 LIMIT 1`,[id]);
  return rows[0]?.is_active===false?null:rows[0]||null;
}

async function getUser(req){
  const header=req.headers.authorization||"";
  if(!header.startsWith("Bearer "))return null;
  const token=header.slice(7).trim();
  if(!token)return null;
  if(token.startsWith(BOARD_TOKEN_PREFIX)){
    const payload=verifyBoardToken(token),user=payload&&await loadKenbridgeUser(payload.sub);
    return user&&isAdmin(user)?user:null;
  }
  try{
    const{data,error}=await supabase.auth.getUser(token);
    return error||!data?.user?null:await loadKenbridgeUser(data.user.id);
  }catch{return null}
}

const isAdmin=u=>String(u?.role||"").toUpperCase()==="ADMIN";
const isBoard=u=>String(u?.role||"").toUpperCase()==="BOARD";

router.post("/login",async(req,res)=>{
  try{
    const h=req.headers.authorization||"";
    if(!h.startsWith("Bearer "))return res.status(401).json({error:"Staff authentication required"});
    const{data,error}=await supabase.auth.getUser(h.slice(7).trim());
    if(error||!data?.user)return res.status(401).json({error:"Staff session is invalid or expired"});
    const user=await loadKenbridgeUser(data.user.id);
    if(!user)return res.status(401).json({error:"Staff account was not found or is inactive"});
    if(!isAdmin(user))return res.status(403).json({error:"Administrator access is required"});
    const password=typeof req.body?.password==="string"?req.body.password:"";
    const portalPassword=process.env.BOARD_PORTAL_PASSWORD||"";
    if(!portalPassword)return res.status(500).json({error:"Board Portal password is not configured"});
    if(!safeEqual(password,portalPassword))return res.status(401).json({error:"Incorrect Board Portal password"});
    res.json({success:true,access_token:createBoardToken(user),token_type:"Bearer",expires_in:BOARD_TOKEN_TTL,user:{id:user.id,email:user.email,full_name:user.full_name,role:user.role}});
  }catch(error){
    console.error("Board login error:",error);
    res.status(500).json({error:"Unable to authenticate with the Board Portal"});
  }
});

router.get("/session",async(req,res)=>{
  try{
    const user=await getUser(req);
    if(!user||!isAdmin(user))return res.status(401).json({authenticated:false});
    res.json({authenticated:true,user:{id:user.id,email:user.email,full_name:user.full_name,role:user.role}});
  }catch{res.status(500).json({authenticated:false})}
});

router.post("/logout",(req,res)=>res.json({success:true}));

async function boardAccess(req,res){
  const user=await getUser(req);
  if(!user)return res.status(401).json({success:false,message:"Board authentication required."});
  if(!isAdmin(user)&&!isBoard(user))return res.status(403).json({success:false,message:"Board access required."});
  return user;
}

async function profile(req,res){
  try{
    const user=await getUser(req);
    if(!user)return res.status(401).json({success:false,message:"Board authentication required."});
    const{rows}=await pool.query("SELECT * FROM board_members WHERE user_id=$1 LIMIT 1",[user.id]);
    res.json({success:true,user,is_admin:isAdmin(user),is_board:isBoard(user),board_member:rows[0]||null});
  }catch(error){
    console.error("BOARD PROFILE ERROR:",error.message);
    res.status(500).json({success:false,message:"Unable to load Board profile."});
  }
}

router.get("/me",profile);
router.get("/profile",profile);

router.get("/members",async(req,res)=>{
  try{
    if(!await boardAccess(req,res))return;
    const{rows}=await pool.query(`SELECT bm.*,u.full_name,u.username,u.email,u.position,u.department,u.phone
      FROM board_members bm JOIN users u ON u.id=bm.user_id ORDER BY bm.is_active DESC,u.full_name ASC`);
    res.json({success:true,members:rows});
  }catch(error){
    console.error("GET BOARD MEMBERS ERROR:",error.message);
    res.status(500).json({success:false,message:"Unable to retrieve Board members."});
  }
});

router.put("/members/:id",async(req,res)=>{
  try{
    const admin=await getUser(req);
    if(!admin)return res.status(401).json({success:false,message:"Authentication required."});
    if(!isAdmin(admin))return res.status(403).json({success:false,message:"Administrator access required."});
    const{full_name,username,email,board_position,appointment_date,term_end_date,bio,phone,is_active}=req.body||{};
    if(!full_name||!username||!email||!board_position)return res.status(400).json({success:false,message:"Full name, username, email and Board position are required."});
    const name=String(full_name).trim(),userName=String(username).trim(),mail=String(email).trim().toLowerCase(),position=String(board_position).trim();
    const{rows:duplicate}=await pool.query(`SELECT id FROM users WHERE (LOWER(email)=LOWER($1) OR LOWER(username)=LOWER($2)) AND id<>$3 LIMIT 1`,[mail,userName,req.params.id]);
    if(duplicate.length)return res.status(409).json({success:false,message:"Another account already uses that email or username."});
    const client=await pool.connect();
    try{
      await client.query("BEGIN");
      const{rows}=await client.query(`UPDATE users SET full_name=$1,username=$2,email=$3,role='BOARD',position=$4,department='Board of Governors',phone=$5,is_active=$6,updated_at=NOW()
        WHERE id=$7 RETURNING id,full_name,username,email,role,position,department,phone,is_active`,
        [name,userName,mail,position,phone?.trim()||null,is_active!==false,req.params.id]);
      if(!rows[0]){await client.query("ROLLBACK");return res.status(404).json({success:false,message:"Board member account was not found."})}
      await client.query(`UPDATE board_members SET board_position=$1,appointment_date=$2,term_end_date=$3,bio=$4,is_active=$5,updated_at=NOW() WHERE user_id=$6`,
        [position,appointment_date||null,term_end_date||null,bio?.trim()||null,is_active!==false,req.params.id]);
      await client.query("COMMIT");
      res.json({success:true,message:"Board member updated successfully.",member:rows[0]});
    }catch(error){await client.query("ROLLBACK");throw error}finally{client.release()}
  }catch(error){
    console.error("UPDATE BOARD MEMBER ERROR:",error.message);
    res.status(error.code==="23505"?409:500).json({success:false,message:error.code==="23505"?"That username or email is already in use.":"Unable to update Board member."});
  }
});

router.patch("/members/:id/status",async(req,res)=>{
  try{
    const admin=await getUser(req);
    if(!admin)return res.status(401).json({success:false,message:"Authentication required."});
    if(!isAdmin(admin))return res.status(403).json({success:false,message:"Administrator access required."});
    const{is_active}=req.body||{};
    if(typeof is_active!=="boolean")return res.status(400).json({success:false,message:"A valid account status is required."});
    const{rows}=await pool.query(`UPDATE users SET is_active=$1,updated_at=NOW() WHERE id=$2 AND role='BOARD'
      RETURNING id,full_name,username,email,role,position,is_active`,[is_active,req.params.id]);
    if(!rows[0])return res.status(404).json({success:false,message:"Board member account was not found."});
    await pool.query("UPDATE board_members SET is_active=$1,updated_at=NOW() WHERE user_id=$2",[is_active,req.params.id]);
    res.json({success:true,message:is_active?"Board member enabled successfully.":"Board member disabled successfully.",member:rows[0]});
  }catch(error){
    console.error("BOARD MEMBER STATUS ERROR:",error.message);
    res.status(500).json({success:false,message:"Unable to update Board member status."});
  }
});

router.delete("/members/:id",async(req,res)=>{
  try{
    const admin=await getUser(req);
    if(!admin)return res.status(401).json({success:false,message:"Authentication required."});
    if(!isAdmin(admin))return res.status(403).json({success:false,message:"Administrator access required."});
    const{rows}=await pool.query("SELECT id FROM users WHERE id=$1 AND role='BOARD' LIMIT 1",[req.params.id]);
    if(!rows[0])return res.status(404).json({success:false,message:"Board member account was not found."});
    await pool.query("DELETE FROM board_members WHERE user_id=$1",[req.params.id]);
    await pool.query("DELETE FROM users WHERE id=$1",[req.params.id]);
    const{error}=await supabase.auth.admin.deleteUser(req.params.id);
    if(error)console.error("SUPABASE BOARD DELETE ERROR:",error.message);
    res.json({success:true,message:"Board member account deleted successfully."});
  }catch(error){
    console.error("DELETE BOARD MEMBER ERROR:",error.message);
    res.status(500).json({success:false,message:"Unable to delete Board member."});
  }
});

router.get("/meetings",async(req,res)=>{
  try{
    if(!await boardAccess(req,res))return;
    const{rows}=await pool.query(`SELECT bm.*,u.full_name AS creator_name FROM board_meetings bm
      LEFT JOIN users u ON u.id=bm.created_by ORDER BY bm.meeting_date DESC,bm.start_time DESC`);
    res.json({success:true,meetings:rows});
  }catch{res.status(500).json({success:false,message:"Unable to retrieve Board meetings."})}
});

router.get("/meetings/:id",async(req,res)=>{
  try{
    if(!await boardAccess(req,res))return;
    const{rows}=await pool.query(`SELECT bm.*,u.full_name AS creator_name FROM board_meetings bm
      LEFT JOIN users u ON u.id=bm.created_by WHERE bm.id=$1 LIMIT 1`,[req.params.id]);
    if(!rows[0])return res.status(404).json({success:false,message:"Board meeting was not found."});
    const{rows:agenda}=await pool.query("SELECT * FROM board_agenda_items WHERE meeting_id=$1 ORDER BY item_number ASC",[req.params.id]);
    res.json({success:true,meeting:rows[0],agenda});
  }catch{res.status(500).json({success:false,message:"Unable to retrieve Board meeting."})}
});

router.post("/meetings",async(req,res)=>{
  try{
    const user=await boardAccess(req,res);
    if(!user)return;
    const{title,description,meeting_date,start_time,end_time,meeting_type="online",location,online_provider,meeting_url,meeting_id,passcode,status="scheduled"}=req.body||{};
    if(!title||!meeting_date||!start_time)return res.status(400).json({success:false,message:"Meeting title, date and start time are required."});
    const type=String(meeting_type).toLowerCase(),meetingStatus=String(status).toLowerCase();
    if(!["online","physical","hybrid"].includes(type))return res.status(400).json({success:false,message:"Invalid meeting type."});
    if(!["scheduled","in_progress","completed","cancelled"].includes(meetingStatus))return res.status(400).json({success:false,message:"Invalid meeting status."});
    const{rows}=await pool.query(`INSERT INTO board_meetings(title,description,meeting_date,start_time,end_time,meeting_type,location,online_provider,meeting_url,meeting_id,passcode,status,created_by,created_at,updated_at)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,NOW(),NOW()) RETURNING *`,
      [title.trim(),description?.trim()||null,meeting_date,start_time,end_time||null,type,location?.trim()||null,online_provider?.trim()||null,meeting_url?.trim()||null,meeting_id?.trim()||null,passcode?.trim()||null,meetingStatus,user.id]);
    res.status(201).json({success:true,message:"Board meeting created successfully.",meeting:rows[0]});
  }catch{res.status(500).json({success:false,message:"Unable to create Board meeting."})}
});

router.get("/documents",async(req,res)=>{
  try{
    if(!await boardAccess(req,res))return;
    const{rows}=await pool.query(`SELECT bd.*,u.full_name AS uploader_name,m.title AS meeting_title,m.meeting_date
      FROM board_documents bd LEFT JOIN users u ON u.id=bd.uploaded_by LEFT JOIN board_meetings m ON m.id=bd.meeting_id
      ORDER BY bd.created_at DESC`);
    res.json({success:true,documents:rows});
  }catch{res.status(500).json({success:false,message:"Unable to retrieve Board documents."})}
});

router.post("/documents",async(req,res)=>{
  try{
    const admin=await getUser(req);
    if(!admin)return res.status(401).json({success:false,message:"Authentication required."});
    if(!isAdmin(admin))return res.status(403).json({success:false,message:"Administrator access required."});
    const{title,description,document_type="document",file_url,storage_path,meeting_id,is_confidential}=req.body||{};
    if(!title)return res.status(400).json({success:false,message:"Document title is required."});
    const type=String(document_type).toLowerCase();
    if(!["agenda","minutes","policy","plan","report","resolution","document","other"].includes(type))return res.status(400).json({success:false,message:"Invalid document type."});
    if(!file_url&&!storage_path)return res.status(400).json({success:false,message:"A file URL or storage path is required."});
    const{rows}=await pool.query(`INSERT INTO board_documents(title,description,document_type,file_url,storage_path,meeting_id,uploaded_by,is_confidential,created_at)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,NOW()) RETURNING *`,
      [title.trim(),description?.trim()||null,type,file_url?.trim()||null,storage_path?.trim()||null,meeting_id||null,admin.id,is_confidential===true||String(is_confidential).toLowerCase()==="true"]);
    res.status(201).json({success:true,message:"Board document created successfully.",document:rows[0]});
  }catch{res.status(500).json({success:false,message:"Unable to create Board document."})}
});

module.exports=router;
