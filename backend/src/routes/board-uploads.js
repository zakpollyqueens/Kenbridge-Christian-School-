const express=require("express");
const crypto=require("crypto");
const path=require("path");
const supabase=require("../supabase");
const router=express.Router();

const BUCKET="School Documents";
const MAX_SIZE=25*1024*1024;

const ALLOWED={
 "application/pdf":".pdf",
 "application/msword":".doc",
 "application/vnd.openxmlformats-officedocument.wordprocessingml.document":".docx",
 "application/vnd.ms-excel":".xls",
 "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet":".xlsx",
 "application/vnd.ms-powerpoint":".ppt",
 "application/vnd.openxmlformats-officedocument.presentationml.presentation":".pptx",
 "text/plain":".txt",
 "image/jpeg":".jpg",
 "image/png":".png",
 "image/webp":".webp"
};

async function getUser(req){
 const header=req.headers.authorization||"";
 const token=header.startsWith("Bearer ")?header.slice(7):null;

 if(!token)return null;

 const {data,error}=await supabase.auth.getUser(token);
 if(error||!data?.user)return null;

 const {data:user,error:userError}=await supabase
  .from("users")
  .select("*")
  .eq("id",data.user.id)
  .maybeSingle();

 if(userError||!user||user.is_active===false)return null;

 return user;
}

function allowed(user){
 const role=String(user?.role||"").toUpperCase();
 return role==="ADMIN"||role==="BOARD";
}

function safeName(name){
 return path.basename(String(name||"document"))
  .replace(/[^\w.\- ()]/g,"_")
  .replace(/\s+/g," ")
  .slice(0,150);
}

function extFor(name,type){
 const ext=path.extname(name||"").toLowerCase();
 return ext||ALLOWED[type]||"";
}

router.post(
 "/upload",
 express.raw({
  type:"application/octet-stream",
  limit:"25mb"
 }),
 async(req,res)=>{
  try{
   const user=await getUser(req);

   if(!user){
    return res.status(401).json({
     success:false,
     message:"Authentication required."
    });
   }

   if(!allowed(user)){
    return res.status(403).json({
     success:false,
     message:"Board access required."
    });
   }

   if(!Buffer.isBuffer(req.body)||!req.body.length){
    return res.status(400).json({
     success:false,
     message:"No file data was received."
    });
   }

   if(req.body.length>MAX_SIZE){
    return res.status(413).json({
     success:false,
     message:"File is too large. Maximum size is 25 MB."
    });
   }

   const originalName=safeName(
    req.headers["x-file-name"]||"document"
   );

   const contentType=String(
    req.headers["x-file-type"]||"application/octet-stream"
   ).split(";")[0].trim().toLowerCase();

   if(!ALLOWED[contentType]){
    return res.status(415).json({
     success:false,
     message:"This file type is not supported."
    });
   }

   const extension=extFor(originalName,contentType);

   const folder=String(
    req.headers["x-folder"]||"board"
   ).replace(/[^a-zA-Z0-9_-]/g,"_").slice(0,40);

   const id=crypto.randomUUID();

   const filename=`${id}${extension}`;
   const storagePath=`${folder}/${new Date().getFullYear()}/${filename}`;

   const {error:uploadError}=await supabase
    .storage
    .from(BUCKET)
    .upload(storagePath,req.body,{
     contentType,
     upsert:false
    });

   if(uploadError){
    console.error("Board document upload error:",uploadError);
    return res.status(500).json({
     success:false,
     message:"Unable to upload the document.",
     error:uploadError.message
    });
   }

   return res.status(201).json({
    success:true,
    message:"Document uploaded successfully.",
    file:{
     original_name:originalName,
     storage_path:storagePath,
     bucket:BUCKET,
     content_type:contentType,
     size:req.body.length
    }
   });
  }catch(error){
   console.error("Board upload route error:",error);

   return res.status(500).json({
    success:false,
    message:"Document upload failed.",
    error:error.message
   });
  }
 }
);

router.get(
 "/download",
 async(req,res)=>{
  try{
   const user=await getUser(req);

   if(!user){
    return res.status(401).json({
     success:false,
     message:"Authentication required."
    });
   }

   if(!allowed(user)){
    return res.status(403).json({
     success:false,
     message:"Board access required."
    });
   }

   const storagePath=String(req.query.path||"").trim();

   if(!storagePath||storagePath.includes("..")){
    return res.status(400).json({
     success:false,
     message:"A valid storage path is required."
    });
   }

   const {data,error}=await supabase
    .storage
    .from(BUCKET)
    .download(storagePath);

   if(error||!data){
    console.error("Board document download error:",error);

    return res.status(404).json({
     success:false,
     message:"Document not found."
    });
   }

   const buffer=Buffer.from(await data.arrayBuffer());

   res.setHeader(
    "Content-Type",
    data.type||"application/octet-stream"
   );

   res.setHeader(
    "Content-Length",
    buffer.length
   );

   res.setHeader(
    "Content-Disposition",
    "inline"
   );

   return res.send(buffer);
  }catch(error){
   console.error("Board download route error:",error);

   return res.status(500).json({
    success:false,
    message:"Unable to download the document.",
    error:error.message
   });
  }
 }
);

router.delete(
 "/delete",
 express.json(),
 async(req,res)=>{
  try{
   const user=await getUser(req);

   if(!user){
    return res.status(401).json({
     success:false,
     message:"Authentication required."
    });
   }

   if(String(user.role||"").toUpperCase()!=="ADMIN"){
    return res.status(403).json({
     success:false,
     message:"Administrator access required."
    });
   }

   const storagePath=String(req.body?.storage_path||"").trim();

   if(!storagePath||storagePath.includes("..")){
    return res.status(400).json({
     success:false,
     message:"A valid storage path is required."
    });
   }

   const {error}=await supabase
    .storage
    .from(BUCKET)
    .remove([storagePath]);

   if(error){
    console.error("Board document delete error:",error);

    return res.status(500).json({
     success:false,
     message:"Unable to delete the stored file.",
     error:error.message
    });
   }

   return res.json({
    success:true,
    message:"Stored document deleted successfully.",
    storage_path:storagePath
   });
  }catch(error){
   console.error("Board storage delete route error:",error);

   return res.status(500).json({
    success:false,
    message:"Unable to delete the stored document.",
    error:error.message
   });
  }
 }
);

module.exports=router;
