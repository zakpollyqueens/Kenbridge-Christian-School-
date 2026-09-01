const express=require("express");
const multer=require("multer");
const path=require("path");
const supabase=require("../supabase");
const pool=require("../db");
const router=express.Router();

const upload=multer({storage:multer.memoryStorage(),limits:{fileSize:20*1024*1024}});

async function getAuthenticatedStaff(req,res){
try{
const authorization=req.headers.authorization;
if(!authorization?.startsWith("Bearer ")){res.status(401).json({success:false,message:"Authorization token is required."});return null;}
const token=authorization.replace("Bearer ","");
const {data,error}=await supabase.auth.getUser(token);
if(error||!data?.user){res.status(401).json({success:false,message:"Invalid or expired session."});return null;}
const {rows}=await pool.query(`SELECT id,full_name,email,role,is_active FROM users WHERE id=$1 LIMIT 1`,[data.user.id]);
const user=rows[0];
if(!user){res.status(403).json({success:false,message:"Your staff profile was not found."});return null;}
if(!user.is_active){res.status(403).json({success:false,message:"Your staff account is inactive."});return null;}
const role=String(user.role||"").toUpperCase();
if(role!=="STAFF"&&role!=="ADMIN"){res.status(403).json({success:false,message:"Your account does not have permission to access this resource."});return null;}
return user;
}catch(error){
console.error("STAFF CONTENT AUTHORIZATION ERROR:",error.message);
res.status(500).json({success:false,message:"Unable to verify your session."});
return null;
}
}

/* ANNOUNCEMENTS */

router.get("/announcements",async(req,res)=>{
try{
const user=await getAuthenticatedStaff(req,res);
if(!user)return;
const {rows}=await pool.query(`SELECT a.id,a.title,a.content,a.category,a.is_published,a.created_at,a.updated_at,a.created_by,u.full_name AS author_name FROM announcements a LEFT JOIN users u ON a.created_by=u.id WHERE a.is_published=true OR a.created_by=$1 ORDER BY a.created_at DESC`,[user.id]);
return res.status(200).json({success:true,announcements:rows});
}catch(error){
console.error("GET STAFF ANNOUNCEMENTS ERROR:",error.message);
return res.status(500).json({success:false,message:"Unable to retrieve announcements."});
}
});

router.post("/announcements",async(req,res)=>{
try{
const user=await getAuthenticatedStaff(req,res);
if(!user)return;
const {title,content,category}=req.body||{};
if(!title||!String(title).trim())return res.status(400).json({success:false,message:"Announcement title is required."});
if(String(title).trim().length>200)return res.status(400).json({success:false,message:"Announcement title cannot exceed 200 characters."});
if(!content||!String(content).trim())return res.status(400).json({success:false,message:"Announcement content is required."});
const cleanTitle=String(title).trim();
const cleanContent=String(content).trim();
const cleanCategory=category&&String(category).trim()?String(category).trim():"General";
const {rows}=await pool.query(`INSERT INTO announcements(title,content,category,is_published,created_by,created_at,updated_at) VALUES($1,$2,$3,false,$4,NOW(),NOW()) RETURNING id,title,content,category,is_published,created_by,created_at,updated_at`,[cleanTitle,cleanContent,cleanCategory,user.id]);
return res.status(201).json({success:true,message:"Announcement submitted successfully and is awaiting administrator approval.",announcement:{...rows[0],author_name:user.full_name}});
}catch(error){
console.error("CREATE STAFF ANNOUNCEMENT ERROR:",error.message);
return res.status(500).json({success:false,message:"Unable to submit the announcement."});
}
});

router.get("/announcements/:id",async(req,res)=>{
try{
const user=await getAuthenticatedStaff(req,res);
if(!user)return;
const {rows}=await pool.query(`SELECT a.id,a.title,a.content,a.category,a.is_published,a.created_at,a.updated_at,a.created_by,u.full_name AS author_name FROM announcements a LEFT JOIN users u ON a.created_by=u.id WHERE a.id=$1 AND (a.is_published=true OR a.created_by=$2) LIMIT 1`,[req.params.id,user.id]);
if(!rows[0])return res.status(404).json({success:false,message:"Announcement was not found or you do not have permission to view it."});
return res.status(200).json({success:true,announcement:rows[0]});
}catch(error){
console.error("GET STAFF ANNOUNCEMENT ERROR:",error.message);
return res.status(500).json({success:false,message:"Unable to retrieve the announcement."});
}
});

/* DOCUMENTS */

router.get("/documents",async(req,res)=>{
try{
const user=await getAuthenticatedStaff(req,res);
if(!user)return;
const role=String(user.role||"").toUpperCase();
let query,values;
if(role==="ADMIN"){
query=`SELECT d.id,d.title,d.description,d.file_name,d.file_url,d.storage_path,d.file_type,d.file_size,d.uploaded_by,d.is_published,d.created_at,d.updated_at,u.full_name AS uploaded_by_name FROM documents d LEFT JOIN users u ON d.uploaded_by=u.id ORDER BY d.created_at DESC`;
values=[];
}else{
query=`SELECT d.id,d.title,d.description,d.file_name,d.file_url,d.storage_path,d.file_type,d.file_size,d.uploaded_by,d.is_published,d.created_at,d.updated_at,u.full_name AS uploaded_by_name FROM documents d LEFT JOIN users u ON d.uploaded_by=u.id WHERE d.is_published=true OR d.uploaded_by=$1 ORDER BY d.created_at DESC`;
values=[user.id];
}
const {rows}=await pool.query(query,values);
return res.status(200).json({success:true,documents:rows});
}catch(error){
console.error("GET DOCUMENTS ERROR:",error.message);
return res.status(500).json({success:false,message:"Unable to retrieve documents."});
}
});

router.post("/documents/upload",upload.single("file"),async(req,res)=>{
try{
const user=await getAuthenticatedStaff(req,res);
if(!user)return;

if(!req.file)return res.status(400).json({success:false,message:"Please select a file to upload."});

const title=String(req.body.title||"").trim();
if(!title)return res.status(400).json({success:false,message:"Document title is required."});

const originalName=req.file.originalname;
const extension=path.extname(originalName).toLowerCase();

const allowed=[".pdf",".doc",".docx",".xls",".xlsx",".ppt",".pptx",".txt",".jpg",".jpeg",".png",".webp"];

if(!allowed.includes(extension)){
return res.status(400).json({success:false,message:"This file type is not allowed."});
}

const safeName=originalName.replace(/[^a-zA-Z0-9._-]/g,"-");
const storagePath=`${user.id}/${Date.now()}-${safeName}`;

const {error:uploadError}=await supabase.storage
.from("school-documents")
.upload(storagePath,req.file.buffer,{
contentType:req.file.mimetype,
upsert:false
});

if(uploadError){
console.error("DOCUMENT STORAGE UPLOAD ERROR:",uploadError.message);
return res.status(500).json({success:false,message:"Document could not be uploaded to storage: "+uploadError.message});
}

const {data:urlData}=supabase.storage
.from("school-documents")
.getPublicUrl(storagePath);

const fileUrl=urlData?.publicUrl;

if(!fileUrl){
await supabase.storage.from("school-documents").remove([storagePath]);
return res.status(500).json({success:false,message:"Document URL could not be created."});
}

const description=String(req.body.description||"").trim()||null;

try{
const {rows}=await pool.query(
`INSERT INTO documents(title,description,file_name,file_url,storage_path,file_type,file_size,uploaded_by,is_published,created_at,updated_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,false,NOW(),NOW()) RETURNING id,title,description,file_name,file_url,storage_path,file_type,file_size,uploaded_by,is_published,created_at,updated_at`,
[
title,
description,
originalName,
fileUrl,
storagePath,
req.file.mimetype,
req.file.size,
user.id
]
);

return res.status(201).json({
success:true,
message:"Document uploaded successfully and is awaiting administrator approval.",
document:rows[0]
});
}catch(databaseError){
console.error("DOCUMENT DATABASE ERROR:",databaseError.message);
await supabase.storage.from("school-documents").remove([storagePath]);
return res.status(500).json({success:false,message:"Document was uploaded but its database record could not be saved."});
}

}catch(error){
console.error("DOCUMENT UPLOAD ERROR:",error.message);
return res.status(500).json({success:false,message:error.message||"Unable to upload document."});
}
});

router.delete("/documents/:id",async(req,res)=>{
try{
const user=await getAuthenticatedStaff(req,res);
if(!user)return;

const role=String(user.role||"").toUpperCase();

const {rows}=await pool.query(
`SELECT id,storage_path,uploaded_by FROM documents WHERE id=$1 LIMIT 1`,
[req.params.id]
);

const document=rows[0];

if(!document)return res.status(404).json({success:false,message:"Document was not found."});

if(role!=="ADMIN"&&document.uploaded_by!==user.id){
return res.status(403).json({success:false,message:"You do not have permission to delete this document."});
}

await pool.query(`DELETE FROM documents WHERE id=$1`,[document.id]);

if(document.storage_path){
const {error:storageError}=await supabase.storage
.from("school-documents")
.remove([document.storage_path]);

if(storageError){
console.error("DOCUMENT STORAGE DELETE ERROR:",storageError.message);
}
}

return res.status(200).json({success:true,message:"Document deleted successfully."});

}catch(error){
console.error("DELETE DOCUMENT ERROR:",error.message);
return res.status(500).json({success:false,message:"Unable to delete document."});
}
});

router.use((error,req,res,next)=>{
if(error instanceof multer.MulterError){
return res.status(400).json({success:false,message:error.message});
}
return next(error);
});

module.exports=router;
