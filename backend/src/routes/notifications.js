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
    `SELECT id,role,is_active
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

router.get("/",async(req,res)=>{
  try{
    const user=await getAuthenticatedUser(req);

    const {rows}=await pool.query(
      `SELECT
        id,
        title,
        message,
        notification_type,
        is_read,
        created_at
       FROM staff_notifications
       WHERE user_id=$1
       ORDER BY created_at DESC`,
      [user.id]
    );

    return res.status(200).json({
      success:true,
      notifications:rows
    });

  }catch(error){
    console.error(
      "GET NOTIFICATIONS ERROR:",
      error.message
    );

    return res.status(401).json({
      success:false,
      message:error.message||"Unable to retrieve notifications."
    });
  }
});

router.patch("/:id/read",async(req,res)=>{
  try{
    const user=await getAuthenticatedUser(req);

    const {rows}=await pool.query(
      `UPDATE staff_notifications
       SET is_read=true
       WHERE id=$1
         AND user_id=$2
       RETURNING
         id,
         title,
         message,
         notification_type,
         is_read,
         created_at`,
      [
        req.params.id,
        user.id
      ]
    );

    if(!rows.length){
      return res.status(404).json({
        success:false,
        message:"Notification was not found."
      });
    }

    return res.status(200).json({
      success:true,
      message:"Notification marked as read.",
      notification:rows[0]
    });

  }catch(error){
    console.error(
      "MARK NOTIFICATION READ ERROR:",
      error.message
    );

    return res.status(500).json({
      success:false,
      message:"Unable to update notification."
    });
  }
});

router.patch("/read-all",async(req,res)=>{
  try{
    const user=await getAuthenticatedUser(req);

    await pool.query(
      `UPDATE staff_notifications
       SET is_read=true
       WHERE user_id=$1
         AND is_read=false`,
      [user.id]
    );

    return res.status(200).json({
      success:true,
      message:"All notifications marked as read."
    });

  }catch(error){
    console.error(
      "MARK ALL NOTIFICATIONS READ ERROR:",
      error.message
    );

    return res.status(500).json({
      success:false,
      message:"Unable to update notifications."
    });
  }
});

module.exports=router;
