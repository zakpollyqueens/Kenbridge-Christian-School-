const express=require("express");
const multer=require("multer");
const supabase=require("../supabase");
const pool=require("../db");

const router=express.Router();

const upload=multer({
storage:multer.memoryStorage(),
limits:{fileSize:25*1024*1024}
});

const STORAGE_BUCKET="school-documents";

async function getUser(req){
const authorization=req.headers.authorization;

if(!authorization?.startsWith("Bearer ")){
const error=new Error("Authorization token is required.");
error.status=401;
throw error;
}

const token=authorization.replace("Bearer ","");

const {data,error}=await supabase.auth.getUser(token);

if(error||!data?.user){
const authError=new Error("Invalid or expired session.");
authError.status=401;
throw authError;
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
const profileError=new Error("Your staff profile was not found.");
profileError.status=403;
throw profileError;
}

if(!user.is_active){
const inactiveError=new Error("Your staff account is inactive.");
inactiveError.status=403;
throw inactiveError;
}

return user;
}

function isAdmin(user){
return String(user.role||"").toUpperCase()==="ADMIN";
}

async function getPermissions(user){
if(isAdmin(user))return null;

const {rows}=await pool.query(
`SELECT class_name
FROM staff_class_permissions
WHERE staff_id=$1
ORDER BY class_name`,
[user.id]
);

return rows.map(row=>String(row.class_name||"").trim().toUpperCase());
}

async function canAccessClass(user,className){
if(isAdmin(user))return true;

const cleanClass=String(className||"").trim().toUpperCase();

const {rows}=await pool.query(
`SELECT id
FROM staff_class_permissions
WHERE staff_id=$1
AND UPPER(TRIM(class_name))=$2
LIMIT 1`,
[user.id,cleanClass]
);

return rows.length>0;
}

function cleanFileName(name){
return String(name||"file")
.replace(/[^\w.\-]+/g,"_")
.replace(/_+/g,"_");
}

/*
GET STAFF CLASS PERMISSIONS
GET /api/documents/classes
*/

router.get("/classes",async(req,res)=>{
try{
const user=await getUser(req);

if(isAdmin(user)){
const {rows}=await pool.query(
`SELECT DISTINCT UPPER(TRIM(class_name)) AS class_name
FROM students
WHERE class_name IS NOT NULL
ORDER BY class_name ASC`
);

return res.status(200).json({
success:true,
is_admin:true,
classes:rows.map(row=>row.class_name)
});
}

const classes=await getPermissions(user);

return res.status(200).json({
success:true,
is_admin:false,
classes
});

}catch(error){
console.error("GET DOCUMENT CLASSES ERROR:",error.message);

return res.status(error.status||500).json({
success:false,
message:error.message||"Unable to retrieve class permissions."
});
}
});

/*
GET DOCUMENTS
GET /api/documents
*/

router.get("/",async(req,res)=>{
try{
const user=await getUser(req);

let query=String(req.query.search||"").trim();
let className=String(req.query.class_name||"").trim().toUpperCase();

if(className){
const allowed=await canAccessClass(user,className);

if(!allowed){
return res.status(403).json({
success:false,
message:"You are not authorised to access documents for this class."
});
}
}

let sql="";
let values=[];

if(isAdmin(user)){

sql=`
SELECT
d.id,
d.title,
d.description,
d.file_name,
d.file_url,
d.storage_path,
d.file_type,
d.file_size,
d.class_name,
d.document_scope,
d.uploaded_by,
d.is_published,
d.created_at,
d.updated_at,
u.full_name AS uploader_name
FROM documents d
LEFT JOIN users u
ON d.uploaded_by=u.id
WHERE
($1::text='' OR
LOWER(COALESCE(d.title,'')) LIKE LOWER('%'||$1||'%') OR
LOWER(COALESCE(d.file_name,'')) LIKE LOWER('%'||$1||'%'))
AND
($2::text='' OR UPPER(TRIM(COALESCE(d.class_name,'')))=$2)
ORDER BY d.created_at DESC`;

values=[query,className];

}else{

const permissions=await getPermissions(user);

if(!permissions.length){
return res.status(200).json({
success:true,
documents:[]
});
}

sql=`
SELECT
d.id,
d.title,
d.description,
d.file_name,
d.file_url,
d.storage_path,
d.file_type,
d.file_size,
d.class_name,
d.document_scope,
d.uploaded_by,
d.is_published,
d.created_at,
d.updated_at,
u.full_name AS uploader_name
FROM documents d
LEFT JOIN users u
ON d.uploaded_by=u.id
WHERE
(
d.uploaded_by=$1
OR
(
d.is_published=true
AND UPPER(TRIM(COALESCE(d.class_name,'')))=ANY($2::text[])
)
)
AND
($3::text='' OR
LOWER(COALESCE(d.title,'')) LIKE LOWER('%'||$3||'%') OR
LOWER(COALESCE(d.file_name,'')) LIKE LOWER('%'||$3||'%'))
AND
($4::text='' OR UPPER(TRIM(COALESCE(d.class_name,'')))=$4)
ORDER BY d.created_at DESC`;

values=[
user.id,
permissions,
query,
className
];
}

const {rows}=await pool.query(sql,values);

return res.status(200).json({
success:true,
documents:rows
});

}catch(error){
console.error("GET DOCUMENTS ERROR:",error.message);

return res.status(error.status||500).json({
success:false,
message:error.message||"Unable to retrieve documents."
});
}
});

/*
GET ONE DOCUMENT
GET /api/documents/:id
*/

router.get("/:id",async(req,res)=>{
try{
const user=await getUser(req);

const {rows}=await pool.query(
`SELECT
d.*,
u.full_name AS uploader_name
FROM documents d
LEFT JOIN users u
ON d.uploaded_by=u.id
WHERE d.id=$1
LIMIT 1`,
[req.params.id]
);

const document=rows[0];

if(!document){
return res.status(404).json({
success:false,
message:"Document was not found."
});
}

const owner=document.uploaded_by===user.id;
const admin=isAdmin(user);

let permitted=owner||admin;

if(!permitted&&document.is_published&&document.class_name){
permitted=await canAccessClass(user,document.class_name);
}

if(!permitted){
return res.status(403).json({
success:false,
message:"You do not have permission to access this document."
});
}

return res.status(200).json({
success:true,
document
});

}catch(error){
console.error("GET DOCUMENT ERROR:",error.message);

return res.status(error.status||500).json({
success:false,
message:error.message||"Unable to retrieve document."
});
}
});

/*
UPLOAD DOCUMENT
POST /api/documents/upload
*/

router.post("/upload",upload.single("file"),async(req,res)=>{
let storagePath=null;

try{
const user=await getUser(req);

if(!req.file){
return res.status(400).json({
success:false,
message:"Please select a file to upload."
});
}

const {
title,
description,
class_name,
document_scope
}=req.body||{};

if(!title||!String(title).trim()){
return res.status(400).json({
success:false,
message:"Document title is required."
});
}

if(!class_name||!String(class_name).trim()){
return res.status(400).json({
success:false,
message:"Please select a class for this document."
});
}

const cleanClass=String(class_name).trim().toUpperCase();

const permitted=await canAccessClass(user,cleanClass);

if(!permitted){
return res.status(403).json({
success:false,
message:"You are not authorised to upload documents for this class."
});
}

const originalName=cleanFileName(req.file.originalname);
const extension=originalName.includes(".")
?originalName.split(".").pop()
:"";

storagePath=
`documents/${cleanClass}/${user.id}/${Date.now()}-${crypto.randomUUID()}.${extension}`;

const {error:uploadError}=await supabase.storage
.from(STORAGE_BUCKET)
.upload(storagePath,req.file.buffer,{
contentType:req.file.mimetype,
upsert:false
});

if(uploadError){
console.error("DOCUMENT STORAGE UPLOAD ERROR:",uploadError.message);

return res.status(500).json({
success:false,
message:"Document could not be uploaded to storage: "+uploadError.message
});
}

const {data:publicData}=supabase.storage
.from(STORAGE_BUCKET)
.getPublicUrl(storagePath);

const fileUrl=publicData?.publicUrl;

if(!fileUrl){
throw new Error("Storage uploaded the file but no file URL was returned.");
}

const {rows}=await pool.query(
`INSERT INTO documents(
title,
description,
file_name,
file_url,
storage_path,
file_type,
file_size,
class_name,
document_scope,
uploaded_by,
is_published
)
VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,false)
RETURNING *`,
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
user.id
]
);

return res.status(201).json({
success:true,
message:"Document uploaded successfully and is awaiting administrator approval.",
document:rows[0]
});

}catch(error){
console.error("UPLOAD DOCUMENT ERROR:",error.message);

if(storagePath){
try{
await supabase.storage
.from(STORAGE_BUCKET)
.remove([storagePath]);
}catch(removeError){
console.error("DOCUMENT STORAGE ROLLBACK ERROR:",removeError.message);
}
}

return res.status(error.status||500).json({
success:false,
message:error.message||"Unable to upload document."
});
}
});

/*
PUBLISH DOCUMENT
PATCH /api/documents/:id/publish
ADMIN ONLY
*/

router.patch("/:id/publish",async(req,res)=>{
try{
const user=await getUser(req);

if(!isAdmin(user)){
return res.status(403).json({
success:false,
message:"Only administrators can publish documents."
});
}

const isPublished=req.body?.is_published!==false;

const {rows}=await pool.query(
`UPDATE documents
SET is_published=$1,
updated_at=NOW()
WHERE id=$2
RETURNING *`,
[isPublished,req.params.id]
);

if(!rows.length){
return res.status(404).json({
success:false,
message:"Document was not found."
});
}

return res.status(200).json({
success:true,
message:isPublished
?"Document published successfully."
:"Document unpublished successfully.",
document:rows[0]
});

}catch(error){
console.error("PUBLISH DOCUMENT ERROR:",error.message);

return res.status(error.status||500).json({
success:false,
message:error.message||"Unable to update document."
});
}
});

/*
DELETE DOCUMENT
DELETE /api/documents/:id
OWNER OR ADMIN
*/

router.delete("/:id",async(req,res)=>{
try{
const user=await getUser(req);

const {rows}=await pool.query(
`SELECT *
FROM documents
WHERE id=$1
LIMIT 1`,
[req.params.id]
);

const document=rows[0];

if(!document){
return res.status(404).json({
success:false,
message:"Document was not found."
});
}

if(!isAdmin(user)&&document.uploaded_by!==user.id){
return res.status(403).json({
success:false,
message:"You can only delete documents you uploaded."
});
}

const {error:storageError}=await supabase.storage
.from(STORAGE_BUCKET)
.remove([document.storage_path]);

if(storageError){
console.error("DOCUMENT STORAGE DELETE ERROR:",storageError.message);

return res.status(500).json({
success:false,
message:"Document could not be removed from storage."
});
}

await pool.query(
`DELETE FROM documents
WHERE id=$1`,
[document.id]
);

return res.status(200).json({
success:true,
message:"Document deleted successfully."
});

}catch(error){
console.error("DELETE DOCUMENT ERROR:",error.message);

return res.status(error.status||500).json({
success:false,
message:error.message||"Unable to delete document."
});
}
});

module.exports=router;
