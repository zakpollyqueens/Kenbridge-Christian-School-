const express=require("express");
const multer=require("multer");
const crypto=require("crypto");
const supabase=require("../supabase");
const pool=require("../db");

const router=express.Router();
const BUCKET="staff-resources";

const upload=multer({
  storage:multer.memoryStorage(),
  limits:{fileSize:25*1024*1024}
});

async function auth(req){
  const h=req.headers.authorization;
  if(!h?.startsWith("Bearer "))
    throw Object.assign(new Error("Authentication required."),{status:401});

  const {data,error}=await supabase.auth.getUser(h.slice(7));
  if(error||!data?.user)
    throw Object.assign(new Error("Invalid or expired session."),{status:401});

  const {rows}=await pool.query(
    `SELECT id,full_name,email,role,is_active
     FROM users
     WHERE id=$1
     LIMIT 1`,
    [data.user.id]
  );

  const user=rows[0];

  if(!user)
    throw Object.assign(new Error("User profile not found."),{status:403});

  if(user.is_active===false)
    throw Object.assign(new Error("Your account is inactive."),{status:403});

  return user;
}

async function staff(user){
  const {rows}=await pool.query(
    `SELECT id,user_id,staff_number,first_name,last_name,
            department,job_title,employment_status
     FROM staff
     WHERE user_id=$1
     LIMIT 1`,
    [user.id]
  );

  if(!rows[0])
    throw Object.assign(new Error("Staff profile not found."),{status:403});

  return rows[0];
}

const admin=u=>String(u.role||"").toUpperCase()==="ADMIN";
const text=v=>String(v??"").trim();

function category(v){
  const allowed=[
    "EXAMS","TESTS","LESSON PLANS","NOTES","ASSIGNMENTS",
    "SCHEMES OF WORK","PAST PAPERS","CHRISTIAN EDUCATION",
    "TEACHING AIDS","POLICIES","FORMS","OTHER"
  ];

  const x=text(v).toUpperCase();
  return allowed.includes(x)?x:"OTHER";
}

function safe(v){
  return String(v||"")
    .replace(/[^\w.\-]+/g,"_")
    .replace(/_+/g,"_");
}

async function signed(path){
  if(!path)return null;

  const {data,error}=await supabase.storage
    .from(BUCKET)
    .createSignedUrl(path,3600);

  return error?null:data?.signedUrl||null;
}

/* LIST */
router.get("/",async(req,res)=>{
  try{
    const user=await auth(req);
    const st=await staff(user);

    const values=[];
    const where=[];

    if(!admin(user)){
      values.push(st.id);
      where.push(`r.uploaded_by=$${values.length}`);
    }

    const filters=[
      ["search",v=>{
        values.push(`%${text(v)}%`);
        const n=values.length;

        where.push(`(
          LOWER(COALESCE(r.title,'')) LIKE LOWER($${n}) OR
          LOWER(COALESCE(r.description,'')) LIKE LOWER($${n}) OR
          LOWER(COALESCE(r.file_name,'')) LIKE LOWER($${n}) OR
          LOWER(COALESCE(r.subject,'')) LIKE LOWER($${n})
        )`);
      }],
      ["category",v=>{
        values.push(text(v).toUpperCase());
        where.push(`UPPER(COALESCE(r.category,''))=$${values.length}`);
      }],
      ["subject",v=>{
        values.push(text(v));
        where.push(`LOWER(COALESCE(r.subject,''))=LOWER($${values.length})`);
      }],
      ["class_level",v=>{
        values.push(text(v).toUpperCase());
        where.push(`UPPER(COALESCE(r.class_level,''))=$${values.length}`);
      }],
      ["academic_year",v=>{
        values.push(text(v));
        where.push(`COALESCE(r.academic_year,'')=$${values.length}`);
      }],
      ["term",v=>{
        values.push(text(v).toUpperCase());
        where.push(`UPPER(COALESCE(r.term,''))=$${values.length}`);
      }]
    ];

    filters.forEach(([key,fn])=>{
      if(text(req.query[key]))fn(req.query[key]);
    });

    const sqlWhere=where.length
      ?`WHERE ${where.join(" AND ")}`
      :"";

    const {rows}=await pool.query(
      `SELECT
        r.id,r.title,r.description,r.category,r.subject,r.class_level,
        r.academic_year,r.term,r.file_name,r.file_path,r.file_type,
        r.file_size,r.uploaded_by,r.created_at,r.updated_at,
        COALESCE(
          NULLIF(TRIM(CONCAT_WS(' ',s.first_name,s.last_name)),''),
          u.full_name,
          'Staff'
        ) AS uploader_name
       FROM staff_resources r
       LEFT JOIN staff s ON s.id=r.uploaded_by
       LEFT JOIN users u ON u.id=s.user_id
       ${sqlWhere}
       ORDER BY r.created_at DESC`,
      values
    );

    const resources=await Promise.all(
      rows.map(async r=>({
        ...r,
        file_url:await signed(r.file_path),
        can_delete:
          admin(user)||
          String(r.uploaded_by)===String(st.id)
      }))
    );

    res.json({
      success:true,
      count:resources.length,
      resources
    });

  }catch(e){
    console.error("RESOURCES LIST:",e);

    res.status(e.status||500).json({
      success:false,
      message:e.message||"Unable to load resources."
    });
  }
});

/* ONE */
router.get("/:id",async(req,res)=>{
  try{
    const user=await auth(req);
    const st=await staff(user);

    const {rows}=await pool.query(
      `SELECT
        r.*,
        COALESCE(
          NULLIF(TRIM(CONCAT_WS(' ',s.first_name,s.last_name)),''),
          u.full_name,
          'Staff'
        ) AS uploader_name
       FROM staff_resources r
       LEFT JOIN staff s ON s.id=r.uploaded_by
       LEFT JOIN users u ON u.id=s.user_id
       WHERE r.id=$1
       LIMIT 1`,
      [req.params.id]
    );

    const r=rows[0];

    if(!r)
      return res.status(404).json({
        success:false,
        message:"Resource not found."
      });

    if(!admin(user)&&String(r.uploaded_by)!==String(st.id))
      return res.status(403).json({
        success:false,
        message:"You do not have access to this resource."
      });

    r.file_url=await signed(r.file_path);

    res.json({
      success:true,
      resource:r
    });

  }catch(e){
    console.error("RESOURCE GET:",e);

    res.status(e.status||500).json({
      success:false,
      message:e.message||"Unable to load resource."
    });
  }
});

/* UPLOAD */
router.post("/upload",upload.single("file"),async(req,res)=>{
  let path=null;

  try{
    const user=await auth(req);
    const st=await staff(user);

    if(!req.file)
      return res.status(400).json({
        success:false,
        message:"Please select a file."
      });

    const title=text(req.body.title);
    const classLevel=text(req.body.class_level).toUpperCase();

    if(!title)
      return res.status(400).json({
        success:false,
        message:"Resource title is required."
      });

    if(!classLevel)
      return res.status(400).json({
        success:false,
        message:"Class level is required."
      });

    const original=safe(req.file.originalname);

    const ext=original.includes(".")
      ?original.split(".").pop().toLowerCase()
      :"file";

    const cat=category(req.body.category);

    path=
      `resources/${cat.toLowerCase().replace(/\s+/g,"-")}/`+
      `${classLevel.replace(/[^\w-]+/g,"-")}/`+
      `${st.id}/${Date.now()}-${crypto.randomUUID()}.${ext}`;

    const {error:storeError}=await supabase.storage
      .from(BUCKET)
      .upload(path,req.file.buffer,{
        contentType:req.file.mimetype,
        upsert:false
      });

    if(storeError)
      throw new Error(
        "Storage upload failed: "+storeError.message
      );

    const {rows}=await pool.query(
      `INSERT INTO staff_resources
       (
         title,description,category,subject,class_level,
         academic_year,term,file_name,file_path,file_type,
         file_size,uploaded_by
       )
       VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
       RETURNING *`,
      [
        title,
        text(req.body.description)||null,
        cat,
        text(req.body.subject)||null,
        classLevel,
        text(req.body.academic_year)||null,
        text(req.body.term).toUpperCase()||null,
        req.file.originalname,
        path,
        req.file.mimetype||null,
        req.file.size||null,
        st.id
      ]
    );

    res.status(201).json({
      success:true,
      message:"Educational resource uploaded successfully.",
      resource:rows[0]
    });

  }catch(e){
    console.error("RESOURCE UPLOAD:",e);

    if(path){
      try{
        await supabase.storage
          .from(BUCKET)
          .remove([path]);
      }catch(x){
        console.error("STORAGE ROLLBACK:",x.message);
      }
    }

    res.status(e.status||500).json({
      success:false,
      message:e.message||"Unable to upload resource."
    });
  }
});

/* DELETE */
router.delete("/:id",async(req,res)=>{
  try{
    const user=await auth(req);
    const st=await staff(user);

    const {rows}=await pool.query(
      `SELECT *
       FROM staff_resources
       WHERE id=$1
       LIMIT 1`,
      [req.params.id]
    );

    const r=rows[0];

    if(!r)
      return res.status(404).json({
        success:false,
        message:"Resource not found."
      });

    if(!admin(user)&&String(r.uploaded_by)!==String(st.id))
      return res.status(403).json({
        success:false,
        message:"You can only delete resources you uploaded."
      });

    if(r.file_path){
      const {error}=await supabase.storage
        .from(BUCKET)
        .remove([r.file_path]);

      if(error)
        throw new Error(
          "Storage deletion failed: "+error.message
        );
    }

    await pool.query(
      `DELETE FROM staff_resources WHERE id=$1`,
      [r.id]
    );

    res.json({
      success:true,
      message:"Resource deleted successfully."
    });

  }catch(e){
    console.error("RESOURCE DELETE:",e);

    res.status(e.status||500).json({
      success:false,
      message:e.message||"Unable to delete resource."
    });
  }
});

module.exports=router;
```
