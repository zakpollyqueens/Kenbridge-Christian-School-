const express=require("express");
const multer=require("multer");
const crypto=require("crypto");
const supabase=require("../supabase");
const pool=require("../db");
const router=express.Router();

const upload=multer({storage:multer.memoryStorage(),limits:{fileSize:25*1024*1024}});
const STORAGE_BUCKET="school-documents";

async function getUser(req){
const authorization=req.headers.authorization;
if(!authorization?.startsWith("Bearer ")){const e=new Error("Authorization token is required.");e.status=401;throw e}
const token=authorization.replace("Bearer ","");
const{data,error}=await supabase.auth.getUser(token);
if(error||!data?.user){const e=new Error("Invalid or expired session.");e.status=401;throw e}
const{rows}=await pool.query(`SELECT id,full_name,email,role,is_active FROM users WHERE id=$1 LIMIT 1`,[data.user.id]);
const user=rows[0];
if(!user){const e=new Error("Your staff profile was not found.");e.status=403;throw e}
if(!user.is_active){const e=new Error("Your staff account is inactive.");e.status=403;throw e}
return user;
}

function isAdmin(user){return String(user.role||"").toUpperCase()==="ADMIN"}

async function getPermissions(user){
if(isAdmin(user))return null;
const{rows}=await pool.query(`SELECT class_name FROM staff_class_permissions WHERE staff_id=$1 ORDER BY class_name`,[user.id]);
return rows.map(r=>String(r.class_name||"").trim().toUpperCase());
}

async function canAccessClass(user,className){
if(isAdmin(user))return true;
const cleanClass=String(className||"").trim().toUpperCase();
const{rows}=await pool.query(`SELECT id FROM staff_class_permissions WHERE staff_id=$1 AND UPPER(TRIM(class_name))=$2 LIMIT 1`,[user.id,cleanClass]);
return rows.length>0;
}

function cleanFileName(name){
return String(name||"file").replace(/[^\w.\-]+/g,"_").replace(/_+/g,"_");
}

function cleanDocumentType(value){
const type=String(value||"FILE").trim().toUpperCase();
return["FILE","REPORT"].includes(type)?type:"FILE";
}

/* GET CLASSES */
router.get("/classes",async(req,res)=>{
try{
const user=await getUser(req);
if(isAdmin(user)){
const{rows}=await pool.query(`SELECT DISTINCT UPPER(TRIM(class_name)) AS class_name FROM students WHERE class_name IS NOT NULL ORDER BY class_name ASC`);
return res.status(200).json({success:true,is_admin:true,classes:rows.map(r=>r.class_name)});
}
return res.status(200).json({success:true,is_admin:false,classes:await getPermissions(user)});
}catch(error){
console.error("GET DOCUMENT CLASSES ERROR:",error.message);
return res.status(error.status||500).json({success:false,message:error.message||"Unable to retrieve class permissions."});
}
});

/* GET REPORT FILES */
router.get("/reports",async(req,res)=>{
try{
const user=await getUser(req);
const className=String(req.query.class_name||"").trim().toUpperCase();

if(className&&!await canAccessClass(user,className)){
return res.status(403).json({success:false,message:"You are not authorised to access reports for this class."});
}

let sql,values;

if(isAdmin(user)){
sql=`SELECT d.id,d.title,d.description,d.file_name,d.file_url,d.storage_path,d.file_type,d.file_size,d.class_name,d.document_scope,d.document_type,d.uploaded_by,d.is_published,d.created_at,d.updated_at,u.full_name AS uploader_name
FROM documents d LEFT JOIN users u ON d.uploaded_by=u.id
WHERE UPPER(COALESCE(d.document_type,'FILE'))='REPORT'
AND ($1::text='' OR UPPER(TRIM(COALESCE(d.class_name,'')))=$1)
ORDER BY d.created_at DESC`;
values=[className];
}else{
const permissions=await getPermissions(user);
if(!permissions.length)return res.status(200).json({success:true,reports:[]});

sql=`SELECT d.id,d.title,d.description,d.file_name,d.file_url,d.storage_path,d.file_type,d.file_size,d.class_name,d.document_scope,d.document_type,d.uploaded_by,d.is_published,d.created_at,d.updated_at,u.full_name AS uploader_name
FROM documents d LEFT JOIN users u ON d.uploaded_by=u.id
WHERE UPPER(COALESCE(d.document_type,'FILE'))='REPORT'
AND (d.uploaded_by=$1 OR (d.is_published=true AND UPPER(TRIM(COALESCE(d.class_name,'')))=ANY($2::text[])))
AND ($3::text='' OR UPPER(TRIM(COALESCE(d.class_name,'')))=$3)
ORDER BY d.created_at DESC`;
values=[user.id,permissions,className];
}

const{rows}=await pool.query(sql,values);
return res.status(200).json({success:true,reports:rows});
}catch(error){
console.error("GET DOCUMENT REPORTS ERROR:",error.message);
return res.status(error.status||500).json({success:false,message:error.message||"Unable to retrieve uploaded reports."});
}
});

/* GET DOCUMENTS */
router.get("/",async(req,res)=>{
try{
const user=await getUser(req);
const query=String(req.query.search||"").trim();
const className=String(req.query.class_name||"").trim().toUpperCase();

if(className&&!await canAccessClass(user,className)){
return res.status(403).json({success:false,message:"You are not authorised to access documents for this class."});
}

let sql,values;

if(isAdmin(user)){
sql=`SELECT d.id,d.title,d.description,d.file_name,d.file_url,d.storage_path,d.file_type,d.file_size,d.class_name,d.document_scope,d.document_type,d.uploaded_by,d.is_published,d.created_at,d.updated_at,u.full_name AS uploader_name
FROM documents d LEFT JOIN users u ON d.uploaded_by=u.id
WHERE ($1::text='' OR LOWER(COALESCE(d.title,'')) LIKE LOWER('%'||$1||'%') OR LOWER(COALESCE(d.file_name,'')) LIKE LOWER('%'||$1||'%'))
AND ($2::text='' OR UPPER(TRIM(COALESCE(d.class_name,'')))=$2)
ORDER BY d.created_at DESC`;
values=[query,className];
}else{
const permissions=await getPermissions(user);
if(!permissions.length)return res.status(200).json({success:true,documents:[]});

sql=`SELECT d.id,d.title,d.description,d.file_name,d.file_url,d.storage_path,d.file_type,d.file_size,d.class_name,d.document_scope,d.document_type,d.uploaded_by,d.is_published,d.created_at,d.updated_at,u.full_name AS uploader_name
FROM documents d LEFT JOIN users u ON d.uploaded_by=u.id
WHERE (d.uploaded_by=$1 OR (d.is_published=true AND UPPER(TRIM(COALESCE(d.class_name,'')))=ANY($2::text[])))
AND ($3::text='' OR LOWER(COALESCE(d.title,'')) LIKE LOWER('%'||$3||'%') OR LOWER(COALESCE(d.file_name,'')) LIKE LOWER('%'||$3||'%'))
AND ($4::text='' OR UPPER(TRIM(COALESCE(d.class_name,'')))=$4)
ORDER BY d.created_at DESC`;
values=[user.id,permissions,query,className];
}

const{rows}=await pool.query(sql,values);
return res.status(200).json({success:true,documents:rows});
}catch(error){
console.error("GET DOCUMENTS ERROR:",error.message);
return res.status(error.status||500).json({success:false,message:error.message||"Unable to retrieve documents."});
}
});

/* GET ONE DOCUMENT */
router.get("/:id",async(req,res)=>{
try{
const user=await getUser(req);
const{rows}=await pool.query(`SELECT d.*,u.full_name AS uploader_name FROM documents d LEFT JOIN users u ON d.uploaded_by=u.id WHERE d.id=$1 LIMIT 1`,[req.params.id]);
const document=rows[0];

if(!document)return res.status(404).json({success:false,message:"Document was not found."});

const owner=document.uploaded_by===user.id;
let permitted=owner||isAdmin(user);

if(!permitted&&document.is_published&&document.class_name){
permitted=await canAccessClass(user,document.class_name);
}

if(!permitted)return res.status(403).json({success:false,message:"You do not have permission to access this document."});
return res.status(200).json({success:true,document});
}catch(error){
console.error("GET DOCUMENT ERROR:",error.message);
return res.status(error.status||500).json({success:false,message:error.message||"Unable to retrieve document."});
}
});

/* UPLOAD DOCUMENT */
router.post("/upload",upload.single("file"),async(req,res)=>{
let storagePath=null;

try{
const user=await getUser(req);

if(!req.file)return res.status(400).json({success:false,message:"Please select a file to upload."});

const{title,description,class_name,document_scope,document_type}=req.body||{};

if(!title||!String(title).trim()){
return res.status(400).json({success:false,message:"Document title is required."});
}

if(!class_name||!String(class_name).trim()){
return res.status(400).json({success:false,message:"Please select a class for this document."});
}

const cleanClass=String(class_name).trim().toUpperCase();
const cleanType=cleanDocumentType(document_type);

if(!await canAccessClass(user,cleanClass)){
return res.status(403).json({success:false,message:"You are not authorised to upload documents for this class."});
}

const originalName=cleanFileName(req.file.originalname);
const extension=originalName.includes(".")?originalName.split(".").pop():"file";

storagePath=`documents/${cleanType.toLowerCase()}/${cleanClass}/${user.id}/${Date.now()}-${crypto.randomUUID()}.${extension}`;

const{error:uploadError}=await supabase.storage.from(STORAGE_BUCKET).upload(storagePath,req.file.buffer,{contentType:req.file.mimetype,upsert:false});

if(uploadError){
return res.status(500).json({success:false,message:"Document could not be uploaded to storage: "+uploadError.message});
}

const{data:publicData}=supabase.storage.from(STORAGE_BUCKET).getPublicUrl(storagePath);
const fileUrl=publicData?.publicUrl;

if(!fileUrl)throw new Error("Storage uploaded the file but no file URL was returned.");

const{rows}=await pool.query(
`INSERT INTO documents(title,description,file_name,file_url,storage_path,file_type,file_size,class_name,document_scope,document_type,uploaded_by,is_published)
VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,false) RETURNING *`,
[
String(title).trim(),
description?String(description).trim():null,
req.file.originalname,
fileUrl,
storagePath,
req.file.mimetype||null,
req.file.size||null,
cleanClass,
document_scope?String(document_scope).trim().toUpperCase():"CLASS",
cleanType,
user.id
]
);

return res.status(201).json({
success:true,
message:cleanType==="REPORT"
?"Report uploaded successfully and is now available in the Reports section."
:"Document uploaded successfully and is awaiting administrator approval.",
document:rows[0]
});

}catch(error){
console.error("UPLOAD DOCUMENT ERROR:",error.message);

if(storagePath){
try{await supabase.storage.from(STORAGE_BUCKET).remove([storagePath])}
catch(removeError){console.error("DOCUMENT STORAGE ROLLBACK ERROR:",removeError.message)}
}

return res.status(error.status||500).json({success:false,message:error.message||"Unable to upload document."});
}
});

/* PUBLISH DOCUMENT */
router.patch("/:id/publish",async(req,res)=>{
try{
const user=await getUser(req);
if(!isAdmin(user))return res.status(403).json({success:false,message:"Only administrators can publish documents."});

const isPublished=req.body?.is_published!==false;

const{rows}=await pool.query(`UPDATE documents SET is_published=$1,updated_at=NOW() WHERE id=$2 RETURNING *`,[isPublished,req.params.id]);

if(!rows.length)return res.status(404).json({success:false,message:"Document was not found."});

return res.status(200).json({
success:true,
message:isPublished?"Document published successfully.":"Document unpublished successfully.",
document:rows[0]
});
}catch(error){
console.error("PUBLISH DOCUMENT ERROR:",error.message);
return res.status(error.status||500).json({success:false,message:error.message||"Unable to update document."});
}
});

/* DELETE DOCUMENT */
router.delete("/:id",async(req,res)=>{
try{
const user=await getUser(req);

const{rows}=await pool.query(`SELECT * FROM documents WHERE id=$1 LIMIT 1`,[req.params.id]);
const document=rows[0];

if(!document)return res.status(404).json({success:false,message:"Document was not found."});

if(!isAdmin(user)&&document.uploaded_by!==user.id){
return res.status(403).json({success:false,message:"You can only delete documents you uploaded."});
}

const{error:storageError}=await supabase.storage.from(STORAGE_BUCKET).remove([document.storage_path]);

if(storageError){
return res.status(500).json({success:false,message:"Document could not be removed from storage."});
}

await pool.query(`DELETE FROM documents WHERE id=$1`,[document.id]);

return res.status(200).json({success:true,message:"Document deleted successfully."});
}catch(error){
console.error("DELETE DOCUMENT ERROR:",error.message);
return res.status(error.status||500).json({success:false,message:error.message||"Unable to delete document."});
}
});

module.exports=router;
