const express=require("express");
const supabase=require("../supabase");
const pool=require("../db");

const router=express.Router();

async function getAuthenticatedStaff(req,res){
  try{
    const authorization=req.headers.authorization;

    if(!authorization?.startsWith("Bearer ")){
      res.status(401).json({
        success:false,
        message:"Authorization token is required."
      });
      return null;
    }

    const token=authorization.replace("Bearer ","");

    const {data,error}=await supabase.auth.getUser(token);

    if(error||!data?.user){
      res.status(401).json({
        success:false,
        message:"Invalid or expired session."
      });
      return null;
    }

    const {rows}=await pool.query(
      `SELECT id,full_name,email,role,is_active
       FROM users
       WHERE id=$1
       LIMIT 1`,
      [data.user.id]
    );

    const user=rows[0];

    if(!user){
      res.status(403).json({
        success:false,
        message:"Your staff profile was not found."
      });
      return null;
    }

    if(!user.is_active){
      res.status(403).json({
        success:false,
        message:"Your staff account is inactive."
      });
      return null;
    }

    const role=String(user.role||"").toUpperCase();

    if(role!=="STAFF"&&role!=="ADMIN"){
      res.status(403).json({
        success:false,
        message:"Your account does not have permission to access announcements."
      });
      return null;
    }

    return user;

  }catch(error){
    console.error("STAFF CONTENT AUTHORIZATION ERROR:",error.message);

    res.status(500).json({
      success:false,
      message:"Unable to verify your session."
    });

    return null;
  }
}

/* GET STAFF ANNOUNCEMENTS

   Staff can see:
   1. Their own announcements, including pending ones.
   2. Announcements that administrators have published.
*/

router.get("/announcements",async(req,res)=>{
  try{
    const user=await getAuthenticatedStaff(req,res);

    if(!user)return;

    const {rows}=await pool.query(
      `SELECT
        a.id,
        a.title,
        a.content,
        a.category,
        a.is_published,
        a.created_at,
        a.updated_at,
        a.created_by,
        u.full_name AS author_name
      FROM announcements a
      LEFT JOIN users u
      ON a.created_by=u.id
      WHERE a.is_published=true
      OR a.created_by=$1
      ORDER BY a.created_at DESC`,
      [user.id]
    );

    return res.status(200).json({
      success:true,
      announcements:rows
    });

  }catch(error){
    console.error("GET STAFF ANNOUNCEMENTS ERROR:",error.message);

    return res.status(500).json({
      success:false,
      message:"Unable to retrieve announcements."
    });
  }
});

/* CREATE STAFF ANNOUNCEMENT

   Staff submissions always begin as unpublished/pending.
   Only an administrator can publish them through
   the existing /api/content announcement management routes.
*/

router.post("/announcements",async(req,res)=>{
  try{
    const user=await getAuthenticatedStaff(req,res);

    if(!user)return;

    const {
      title,
      content,
      category
    }=req.body||{};

    if(!title||!String(title).trim()){
      return res.status(400).json({
        success:false,
        message:"Announcement title is required."
      });
    }

    if(String(title).trim().length>200){
      return res.status(400).json({
        success:false,
        message:"Announcement title cannot exceed 200 characters."
      });
    }

    if(!content||!String(content).trim()){
      return res.status(400).json({
        success:false,
        message:"Announcement content is required."
      });
    }

    const cleanTitle=String(title).trim();
    const cleanContent=String(content).trim();
    const cleanCategory=category&&String(category).trim()
      ?String(category).trim()
      :"General";

    const {rows}=await pool.query(
      `INSERT INTO announcements
      (
        title,
        content,
        category,
        is_published,
        created_by,
        created_at,
        updated_at
      )
      VALUES(
        $1,
        $2,
        $3,
        false,
        $4,
        NOW(),
        NOW()
      )
      RETURNING
        id,
        title,
        content,
        category,
        is_published,
        created_by,
        created_at,
        updated_at`,
      [
        cleanTitle,
        cleanContent,
        cleanCategory,
        user.id
      ]
    );

    return res.status(201).json({
      success:true,
      message:"Announcement submitted successfully and is awaiting administrator approval.",
      announcement:{
        ...rows[0],
        author_name:user.full_name
      }
    });

  }catch(error){
    console.error("CREATE STAFF ANNOUNCEMENT ERROR:",error.message);

    return res.status(500).json({
      success:false,
      message:"Unable to submit the announcement."
    });
  }
});

/* GET ONE ANNOUNCEMENT

   Staff may only open:
   - their own announcement, or
   - an announcement that has already been published.
*/

router.get("/announcements/:id",async(req,res)=>{
  try{
    const user=await getAuthenticatedStaff(req,res);

    if(!user)return;

    const {rows}=await pool.query(
      `SELECT
        a.id,
        a.title,
        a.content,
        a.category,
        a.is_published,
        a.created_at,
        a.updated_at,
        a.created_by,
        u.full_name AS author_name
      FROM announcements a
      LEFT JOIN users u
      ON a.created_by=u.id
      WHERE a.id=$1
      AND (
        a.is_published=true
        OR a.created_by=$2
      )
      LIMIT 1`,
      [
        req.params.id,
        user.id
      ]
    );

    if(!rows[0]){
      return res.status(404).json({
        success:false,
        message:"Announcement was not found or you do not have permission to view it."
      });
    }

    return res.status(200).json({
      success:true,
      announcement:rows[0]
    });

  }catch(error){
    console.error("GET STAFF ANNOUNCEMENT ERROR:",error.message);

    return res.status(500).json({
      success:false,
      message:"Unable to retrieve the announcement."
    });
  }
});

module.exports=router;
