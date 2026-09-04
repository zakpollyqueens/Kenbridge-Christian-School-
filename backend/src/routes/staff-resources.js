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

async function getAuthUser(req){
  const authorization=req.headers.authorization;

  if(!authorization?.startsWith("Bearer ")){
    const e=new Error("Authorization token is required.");
    e.status=401;
    throw e;
  }

  const token=authorization.replace("Bearer ","");
  const {data,error}=await supabase.auth.getUser(token);

  if(error||!data?.user){
    const e=new Error("Invalid or expired session.");
    e.status=401;
    throw e;
  }

  const {rows}=await pool.query(
    `SELECT id,full_name,email,role,is_active
     FROM users WHERE id=$1 LIMIT 1`,
    [data.user.id]
  );

  const user=rows[0];

  if(!user){
    const e=new Error("Your user profile was not found.");
    e.status=403;
    throw e;
  }

  if(!user.is_active){
    const e=new Error("Your account is inactive.");
    e.status=403;
    throw e;
  }

  return user;
}

async function getStaff(user){
  const {rows}=await pool.query(
    `SELECT id,user_id,staff_number,first_name,last_name,
            department,job_title,employment_status
     FROM staff
     WHERE user_id=$1
     LIMIT 1`,
    [user.id]
  );

  if(!rows.length){
    const e=new Error("Your staff profile could not be found.");
    e.status=403;
    throw e;
  }

  return rows[0];
}

function isAdmin(user){
  return String(user.role||"").toUpperCase()==="ADMIN";
}

function clean(value){
  return String(value||"").trim();
}

function cleanFileName(name){
  return String(name||"file")
    .replace(/[^\w.\-]+/g,"_")
    .replace(/_+/g,"_");
}

function cleanCategory(value){
  const allowed=[
    "EXAMS",
    "TESTS",
    "LESSON PLANS",
    "NOTES",
    "ASSIGNMENTS",
    "SCHEMES OF WORK",
    "PAST PAPERS",
    "CHRISTIAN EDUCATION",
    "TEACHING AIDS",
    "POLICIES",
    "FORMS",
    "OTHER"
  ];

  const valueUpper=clean(value).toUpperCase();
  return allowed.includes(valueUpper)?valueUpper:"OTHER";
}

/* GET RESOURCES */
router.get("/",async(req,res)=>{
  try{
    const user=await getAuthUser(req);
    const staff=await getStaff(user);

    const search=clean(req.query.search);
    const category=clean(req.query.category).toUpperCase();
    const subject=clean(req.query.subject);
    const classLevel=clean(req.query.class_level).toUpperCase();
    const academicYear=clean(req.query.academic_year);
    const term=clean(req.query.term).toUpperCase();

    const values=[];
    const conditions=[];

    if(!isAdmin(user)){
      values.push(staff.id);
      conditions.push(`r.uploaded_by=$${values.length}`);
    }

    if(search){
      values.push(`%${search}%`);
      const n=values.length;
      conditions.push(
        `(LOWER(COALESCE(r.title,'')) LIKE LOWER($${n})
          OR LOWER(COALESCE(r.description,'')) LIKE LOWER($${n})
          OR LOWER(COALESCE(r.file_name,'')) LIKE LOWER($${n})
          OR LOWER(COALESCE(r.subject,'')) LIKE LOWER($${n}))`
      );
    }

    if(category){
      values.push(category);
      conditions.push(`UPPER(COALESCE(r.category,''))=$${values.length}`);
    }

    if(subject){
      values.push(subject);
      conditions.push(`LOWER(COALESCE(r.subject,''))=LOWER($${values.length})`);
    }

    if(classLevel){
      values.push(classLevel);
      conditions.push(`UPPER(COALESCE(r.class_level,''))=$${values.length}`);
    }

    if(academicYear){
      values.push(academicYear);
      conditions.push(`COALESCE(r.academic_year,'')=$${values.length}`);
    }

    if(term){
      values.push(term);
      conditions.push(`UPPER(COALESCE(r.term,''))=$${values.length}`);
    }

    const where=conditions.length
      ?`WHERE ${conditions.join(" AND ")}`
      :"";

    const {rows}=await pool.query(
      `SELECT
        r.id,
        r.title,
        r.description,
        r.category,
        r.subject,
        r.class_level,
        r.academic_year,
        r.term,
        r.file_name,
        r.file_path,
        r.file_type,
        r.file_size,
        r.uploaded_by,
        r.created_at,
        r.updated_at,
        COALESCE(
          NULLIF(TRIM(CONCAT_WS(' ',
            s.first_name,
            s.last_name
          )),''),
          u.full_name,
          'Staff'
        ) AS uploader_name
       FROM staff_resources r
       LEFT JOIN staff s ON s.id=r.uploaded_by
       LEFT JOIN users u ON u.id=s.user_id
       ${where}
       ORDER BY r.created_at DESC`,
      values
    );

    const resources=await Promise.all(
      rows.map(async resource=>{
        let file_url=null;

        try{
          const {data,error}=await supabase
            .storage
            .from(BUCKET)
            .createSignedUrl(resource.file_path,3600);

          if(!error)file_url=data?.signedUrl||null;
        }catch(e){
          console.error("SIGNED URL ERROR:",e.message);
        }

        return {
          ...resource,
          file_url,
          can_delete:
            isAdmin(user)||
            String(resource.uploaded_by)===String(staff.id)
        };
      })
    );

    return res.status(200).json({
      success:true,
      resources,
      count:resources.length
    });

  }catch(error){
    console.error("GET STAFF RESOURCES ERROR:",error.message);

    return res.status(error.status||500).json({
      success:false,
      message:error.message||"Unable to retrieve staff resources."
    });
  }
});

/* GET ONE RESOURCE */
router.get("/:id",async(req,res)=>{
  try{
    const user=await getAuthUser(req);
    const staff=await getStaff(user);

    const {rows}=await pool.query(
      `SELECT
        r.*,
        COALESCE(
          NULLIF(TRIM(CONCAT_WS(' ',
            s.first_name,
            s.last_name
          )),''),
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

    const resource=rows[0];

    if(!resource){
      return res.status(404).json({
        success:false,
        message:"Resource was not found."
      });
    }

    if(
      !isAdmin(user)&&
      String(resource.uploaded_by)!==String(staff.id)
    ){
      return res.status(403).json({
        success:false,
        message:"You do not have permission to access this resource."
      });
    }

    const {data,error}=await supabase
      .storage
      .from(BUCKET)
      .createSignedUrl(resource.file_path,3600);

    if(error){
      return res.status(500).json({
        success:false,
        message:"Unable to generate the resource link."
      });
    }

    resource.file_url=data?.signedUrl||null;

    return res.status(200).json({
      success:true,
      resource
    });

  }catch(error){
    console.error("GET STAFF RESOURCE ERROR:",error.message);

    return res.status(error.status||500).json({
      success:false,
      message:error.message||"Unable to retrieve resource."
    });
  }
});

/* UPLOAD RESOURCE */
router.post("/upload",upload.single("file"),async(req,res)=>{
  let filePath=null;

  try{
    const user=await getAuthUser(req);
    const staff=await getStaff(user);

    if(!req.file){
      return res.status(400).json({
        success:false,
        message:"Please select a file to upload."
      });
    }

    const title=clean(req.body?.title);
    const description=clean(req.body?.description);
    const category=cleanCategory(req.body?.category);
    const subject=clean(req.body?.subject);
    const classLevel=clean(req.body?.class_level).toUpperCase();
    const academicYear=clean(req.body?.academic_year);
    const term=clean(req.body?.term).toUpperCase();

    if(!title){
      return res.status(400).json({
        success:false,
        message:"Resource title is required."
      });
    }

    if(!classLevel){
      return res.status(400).json({
        success:false,
        message:"Class level is required."
      });
    }

    const originalName=cleanFileName(req.file.originalname);
    const extension=originalName.includes(".")
      ?originalName.split(".").pop().toLowerCase()
      :"file";

    filePath=
      `resources/${category.toLowerCase().replace(/\s+/g,"-")}/`+
      `${classLevel.replace(/[^\w\-]+/g,"-")}/`+
      `${staff.id}/`+
      `${Date.now()}-${crypto.randomUUID()}.${extension}`;

    const {error:storageError}=await supabase
      .storage
      .from(BUCKET)
      .upload(
        filePath,
        req.file.buffer,
        {
          contentType:req.file.mimetype,
          upsert:false
        }
      );

    if(storageError){
      return res.status(500).json({
        success:false,
        message:"Resource could not be uploaded: "+
          storageError.message
      });
    }

    const {rows}=await pool.query(
      `INSERT INTO staff_resources
       (
        title,
        description,
        category,
        subject,
        class_level,
        academic_year,
        term,
        file_name,
        file_path,
        file_type,
        file_size,
        uploaded_by
       )
       VALUES
       ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
       RETURNING *`,
      [
        title,
        description||null,
        category,
        subject||null,
        classLevel,
        academicYear||null,
        term||null,
        req.file.originalname,
        filePath,
        req.file.mimetype||null,
        req.file.size||null,
        staff.id
      ]
    );

    return res.status(201).json({
      success:true,
      message:"Educational resource uploaded successfully.",
      resource:rows[0]
    });

  }catch(error){
    console.error("UPLOAD STAFF RESOURCE ERROR:",error.message);

    if(filePath){
      try{
        await supabase
          .storage
          .from(BUCKET)
          .remove([filePath]);
      }catch(removeError){
        console.error(
          "RESOURCE STORAGE ROLLBACK ERROR:",
          removeError.message
        );
      }
    }

    return res.status(error.status||500).json({
      success:false,
      message:error.message||"Unable to upload resource."
    });
  }
});

/* DELETE RESOURCE */
router.delete("/:id",async(req,res)=>{
  try{
    const user=await getAuthUser(req);
    const staff=await getStaff(user);

    const {rows}=await pool.query(
      `SELECT *
       FROM staff_resources
       WHERE id=$1
       LIMIT 1`,
      [req.params.id]
    );

    const resource=rows[0];

    if(!resource){
      return res.status(404).json({
        success:false,
        message:"Resource was not found."
      });
    }

    if(
      !isAdmin(user)&&
      String(resource.uploaded_by)!==String(staff.id)
    ){
      return res.status(403).json({
        success:false,
        message:"You can only delete resources you uploaded."
      });
    }

    if(resource.file_path){
      const {error:storageError}=await supabase
        .storage
        .from(BUCKET)
        .remove([resource.file_path]);

      if(storageError){
        return res.status(500).json({
          success:false,
          message:"The resource file could not be removed from storage."
        });
      }
    }

    await pool.query(
      `DELETE FROM staff_resources WHERE id=$1`,
      [resource.id]
    );

    return res.status(200).json({
      success:true,
      message:"Resource deleted successfully."
    });

  }catch(error){
    console.error("DELETE STAFF RESOURCE ERROR:",error.message);

    return res.status(error.status||500).json({
      success:false,
      message:error.message||"Unable to delete resource."
    });
  }
});

module.exports=router;
