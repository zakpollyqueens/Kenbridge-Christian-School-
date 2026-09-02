const express=require("express");
const router=express.Router();
const supabase=require("../config/supabase");
const pool=require("../config/db");

async function authenticateStaff(req,res,next){
  try{
    const auth=req.headers.authorization||"";

    if(!auth.startsWith("Bearer "))
      return res.status(401).json({error:"Authentication required"});

    const token=auth.substring(7).trim();
    const {data,error}=await supabase.auth.getUser(token);

    if(error||!data?.user)
      return res.status(401).json({error:"Invalid or expired session"});

    const result=await pool.query(
      `SELECT id,full_name,username,email,role,status
       FROM users
       WHERE id=$1
       LIMIT 1`,
      [data.user.id]
    );

    if(!result.rows.length)
      return res.status(404).json({error:"User account not found"});

    const user=result.rows[0];

    if(user.status&&String(user.status).toLowerCase()!=="active")
      return res.status(403).json({error:"Account is inactive"});

    if(!["STAFF","ADMIN"].includes(String(user.role).toUpperCase()))
      return res.status(403).json({error:"Staff access required"});

    req.user=user;
    next();

  }catch(err){
    console.error("Messages authentication error:",err);
    res.status(500).json({error:"Authentication failed"});
  }
}

router.use(authenticateStaff);


/* GET /api/messages/staff */
router.get("/staff",async(req,res)=>{
  try{
    const result=await pool.query(
      `SELECT id,full_name,username,email,role
       FROM users
       WHERE LOWER(COALESCE(status,'ACTIVE'))='active'
       AND UPPER(role) IN ('STAFF','ADMIN')
       AND id<>$1
       ORDER BY full_name NULLS LAST,username`,
      [req.user.id]
    );

    res.json({staff:result.rows});

  }catch(err){
    console.error("Get message recipients error:",err);
    res.status(500).json({error:"Failed to load staff"});
  }
});


/* GET /api/messages */
router.get("/",async(req,res)=>{
  try{
    const result=await pool.query(
      `SELECT
        m.id,
        m.sender_id,
        m.receiver_id,
        m.subject,
        m.body,
        m.is_read,
        m.created_at,
        s.full_name AS sender_name,
        s.username AS sender_username,
        r.full_name AS receiver_name,
        r.username AS receiver_username
       FROM messages m
       LEFT JOIN users s ON s.id=m.sender_id
       LEFT JOIN users r ON r.id=m.receiver_id
       WHERE m.sender_id=$1
          OR m.receiver_id=$1
       ORDER BY m.created_at DESC`,
      [req.user.id]
    );

    res.json({messages:result.rows});

  }catch(err){
    console.error("Get messages error:",err);
    res.status(500).json({error:"Failed to load messages"});
  }
});


/* POST /api/messages */
router.post("/",async(req,res)=>{
  try{
    const receiver_id=String(req.body.receiver_id||"").trim();
    const subject=String(req.body.subject||"").trim();
    const body=String(req.body.body||"").trim();

    if(!receiver_id||!body)
      return res.status(400).json({
        error:"Receiver and message body are required"
      });

    if(receiver_id===req.user.id)
      return res.status(400).json({
        error:"You cannot send a message to yourself"
      });

    const receiver=await pool.query(
      `SELECT id
       FROM users
       WHERE id=$1
       AND LOWER(COALESCE(status,'ACTIVE'))='active'
       LIMIT 1`,
      [receiver_id]
    );

    if(!receiver.rows.length)
      return res.status(404).json({
        error:"Receiver not found or inactive"
      });

    const result=await pool.query(
      `INSERT INTO messages
        (sender_id,receiver_id,subject,body,is_read)
       VALUES($1,$2,$3,$4,FALSE)
       RETURNING *`,
      [
        req.user.id,
        receiver_id,
        subject||null,
        body
      ]
    );

    res.status(201).json({
      message:"Message sent successfully",
      data:result.rows[0]
    });

  }catch(err){
    console.error("Send message error:",err);
    res.status(500).json({
      error:"Failed to send message"
    });
  }
});


/* PATCH /api/messages/:id/read */
router.patch("/:id/read",async(req,res)=>{
  try{
    const result=await pool.query(
      `UPDATE messages
       SET is_read=TRUE,
           updated_at=NOW()
       WHERE id=$1
       AND receiver_id=$2
       RETURNING *`,
      [req.params.id,req.user.id]
    );

    if(!result.rows.length)
      return res.status(404).json({
        error:"Message not found"
      });

    res.json({
      message:"Message marked as read",
      data:result.rows[0]
    });

  }catch(err){
    console.error("Mark message read error:",err);
    res.status(500).json({
      error:"Failed to update message"
    });
  }
});


/* DELETE /api/messages/:id */
router.delete("/:id",async(req,res)=>{
  try{
    const result=await pool.query(
      `DELETE FROM messages
       WHERE id=$1
       AND (
         sender_id=$2
         OR receiver_id=$2
       )
       RETURNING id`,
      [req.params.id,req.user.id]
    );

    if(!result.rows.length)
      return res.status(404).json({
        error:"Message not found"
      });

    res.json({
      message:"Message deleted successfully"
    });

  }catch(err){
    console.error("Delete message error:",err);
    res.status(500).json({
      error:"Failed to delete message"
    });
  }
});

module.exports=router;
