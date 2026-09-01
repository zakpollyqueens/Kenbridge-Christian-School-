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
    `SELECT
      id,
      full_name,
      username,
      email,
      role,
      position,
      department,
      phone,
      is_active
     FROM users
     WHERE id=$1
     LIMIT 1`,
    [data.user.id]
  );

  const user=rows[0];

  if(!user){
    throw new Error("Your staff profile was not found.");
  }

  if(!user.is_active){
    throw new Error("This account is inactive.");
  }

  return user;
}

router.get("/staff",async(req,res)=>{
  try{
    const user=await getAuthenticatedUser(req);

    const taskResult=await pool.query(
      `SELECT
        COUNT(*) FILTER(
          WHERE status IN ('PENDING','IN_PROGRESS')
        ) AS active_tasks,
        COUNT(*) FILTER(
          WHERE status='COMPLETED'
        ) AS completed_tasks,
        COUNT(*) AS total_tasks
       FROM staff_tasks
       WHERE assigned_to=$1
          OR created_by=$1`,
      [user.id]
    );

    const taskStats=taskResult.rows[0]||{
      active_tasks:0,
      completed_tasks:0,
      total_tasks:0
    };

    let announcementStats={
      total_announcements:0,
      published_announcements:0
    };

    try{
      const announcementResult=await pool.query(
        `SELECT
          COUNT(*) AS total_announcements,
          COUNT(*) FILTER(
            WHERE is_published=true
          ) AS published_announcements
         FROM announcements
         WHERE author_id=$1
            OR created_by=$1`,
        [user.id]
      );

      announcementStats=announcementResult.rows[0]||announcementStats;

    }catch(error){
      console.log(
        "DASHBOARD ANNOUNCEMENT STATS SKIPPED:",
        error.message
      );
    }

    let articleStats={
      total_articles:0,
      published_articles:0
    };

    try{
      const articleResult=await pool.query(
        `SELECT
          COUNT(*) AS total_articles,
          COUNT(*) FILTER(
            WHERE is_published=true
          ) AS published_articles
         FROM articles
         WHERE author_id=$1
            OR created_by=$1`,
        [user.id]
      );

      articleStats=articleResult.rows[0]||articleStats;

    }catch(error){
      console.log(
        "DASHBOARD ARTICLE STATS SKIPPED:",
        error.message
      );
    }

    let studentStats={
      total_students:0
    };

    try{
      const studentResult=await pool.query(
        `SELECT COUNT(*) AS total_students
         FROM students`
      );

      studentStats=studentResult.rows[0]||studentStats;

    }catch(error){
      console.log(
        "DASHBOARD STUDENT STATS SKIPPED:",
        error.message
      );
    }

    return res.status(200).json({
      success:true,

      user:{
        id:user.id,
        full_name:user.full_name,
        username:user.username,
        email:user.email,
        role:user.role,
        position:user.position,
        department:user.department,
        phone:user.phone
      },

      statistics:{
        tasks:{
          active:Number(taskStats.active_tasks||0),
          completed:Number(taskStats.completed_tasks||0),
          total:Number(taskStats.total_tasks||0)
        },

        announcements:{
          total:Number(
            announcementStats.total_announcements||0
          ),

          published:Number(
            announcementStats.published_announcements||0
          )
        },

        articles:{
          total:Number(
            articleStats.total_articles||0
          ),

          published:Number(
            articleStats.published_articles||0
          )
        },

        students:{
          total:Number(
            studentStats.total_students||0
          )
        }
      }
    });

  }catch(error){

    console.error(
      "STAFF DASHBOARD ERROR:",
      error.message
    );

    return res.status(401).json({
      success:false,
      message:error.message||"Unable to load dashboard."
    });
  }
});

module.exports=router;
