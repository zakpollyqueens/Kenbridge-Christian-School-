const express=require("express");
const supabase=require("../supabase");
const pool=require("../db");

const router=express.Router();

async function getAuthenticatedUser(req){
const authorization=req.headers.authorization;
if(!authorization?.startsWith("Bearer "))throw new Error("Authorization token is required.");
const token=authorization.replace("Bearer ","");
const {data,error}=await supabase.auth.getUser(token);
if(error||!data?.user)throw new Error("Invalid or expired session.");
const {rows}=await pool.query(`SELECT id,full_name,email,role,is_active FROM users WHERE id=$1 LIMIT 1`,[data.user.id]);
const user=rows[0];
if(!user)throw new Error("Your staff profile was not found.");
if(!user.is_active)throw new Error("This account is inactive.");
return user;
}

async function getAdministrator(req){
const user=await getAuthenticatedUser(req);
if(String(user.role).toUpperCase()!=="ADMIN")throw new Error("Only administrators can manage the school gallery.");
return user;
}

router.get("/",async(req,res)=>{
try{
const {category,all}=req.query;
let query=`SELECT id,title,description,image_url,storage_path,category,is_published,created_at,updated_at FROM gallery_images`;
const values=[];
const conditions=[];

if(String(all)!=="true")conditions.push(`is_published=true`);

if(category){
values.push(String(category));
conditions.push(`category=$${values.length}`);
}

if(conditions.length)query+=` WHERE `+conditions.join(" AND ");

query+=` ORDER BY created_at DESC`;

const {rows}=await pool.query(query,values);

return res.status(200).json({
success:true,
images:rows
});
}catch(error){
console.error("GET GALLERY ERROR:",error.message);
return res.status(500).json({
success:false,
message:"Unable to load gallery images."
});
}
});

router.get("/admin",async(req,res)=>{
try{
await getAdministrator(req);

const {rows}=await pool.query(
`SELECT g.id,g.title,g.description,g.image_url,g.storage_path,g.category,g.is_published,g.created_at,g.updated_at,u.full_name AS uploaded_by_name
FROM gallery_images g
LEFT JOIN users u ON u.id=g.uploaded_by
ORDER BY g.created_at DESC`
);

return res.status(200).json({
success:true,
images:rows
});
}catch(error){
console.error("ADMIN GALLERY ERROR:",error.message);
return res.status(403).json({
success:false,
message:error.message||"Unable to load gallery management data."
});
}
});

router.post("/",async(req,res)=>{
try{
const admin=await getAdministrator(req);

const {title,description,image_url,storage_path,category,is_published}=req.body||{};

if(!title||!image_url){
return res.status(400).json({
success:false,
message:"Image title and image URL are required."
});
}

const {rows}=await pool.query(
`INSERT INTO gallery_images(title,description,image_url,storage_path,category,uploaded_by,is_published)
VALUES($1,$2,$3,$4,$5,$6,$7)
RETURNING id,title,description,image_url,storage_path,category,is_published,created_at,updated_at`,
[
String(title).trim(),
description?String(description).trim():null,
String(image_url).trim(),
storage_path?String(storage_path).trim():null,
category?String(category).trim():"School Life",
admin.id,
is_published!==false
]
);

return res.status(201).json({
success:true,
message:"Gallery image added successfully.",
image:rows[0]
});
}catch(error){
console.error("CREATE GALLERY IMAGE ERROR:",error.message);
return res.status(403).json({
success:false,
message:error.message||"Unable to add gallery image."
});
}
});

router.patch("/:id",async(req,res)=>{
try{
await getAdministrator(req);

const {id}=req.params;
const {title,description,image_url,storage_path,category,is_published}=req.body||{};

const {rows}=await pool.query(
`UPDATE gallery_images
SET title=COALESCE($1,title),
description=COALESCE($2,description),
image_url=COALESCE($3,image_url),
storage_path=COALESCE($4,storage_path),
category=COALESCE($5,category),
is_published=COALESCE($6,is_published),
updated_at=NOW()
WHERE id=$7
RETURNING id,title,description,image_url,storage_path,category,is_published,created_at,updated_at`,
[
title===undefined?null:String(title).trim(),
description===undefined?null:String(description).trim(),
image_url===undefined?null:String(image_url).trim(),
storage_path===undefined?null:String(storage_path).trim(),
category===undefined?null:String(category).trim(),
typeof is_published==="boolean"?is_published:null,
id
]
);

if(!rows.length){
return res.status(404).json({
success:false,
message:"Gallery image was not found."
});
}

return res.status(200).json({
success:true,
message:"Gallery image updated successfully.",
image:rows[0]
});
}catch(error){
console.error("UPDATE GALLERY IMAGE ERROR:",error.message);
return res.status(403).json({
success:false,
message:error.message||"Unable to update gallery image."
});
}
});

router.delete("/:id",async(req,res)=>{
try{
await getAdministrator(req);

const {rows}=await pool.query(
`DELETE FROM gallery_images
WHERE id=$1
RETURNING id,title,image_url,storage_path`,
[req.params.id]
);

if(!rows.length){
return res.status(404).json({
success:false,
message:"Gallery image was not found."
});
}

return res.status(200).json({
success:true,
message:"Gallery image deleted successfully.",
image:rows[0]
});
}catch(error){
console.error("DELETE GALLERY IMAGE ERROR:",error.message);
return res.status(403).json({
success:false,
message:error.message||"Unable to delete gallery image."
});
}
});

module.exports=router;
