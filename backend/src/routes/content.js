const express=require("express");
const supabase=require("../supabase");
const pool=require("../db");

const router=express.Router();

async function getAuthenticatedUser(req,res){
try{
const authorization=req.headers.authorization;

if(!authorization?.startsWith("Bearer ")){
res.status(401).json({success:false,message:"Authorization token is required."});
return null;
}

const token=authorization.replace("Bearer ","");
const {data,error}=await supabase.auth.getUser(token);

if(error||!data?.user){
res.status(401).json({success:false,message:"Invalid or expired session."});
return null;
}

const {rows}=await pool.query(
"SELECT id,full_name,username,email,role,is_active FROM users WHERE id=$1 LIMIT 1",
[data.user.id]
);

const user=rows[0];

if(!user){
res.status(403).json({success:false,message:"User profile was not found."});
return null;
}

if(!user.is_active){
res.status(403).json({success:false,message:"This account is inactive."});
return null;
}

return user;

}catch(error){
console.error("CONTENT AUTHENTICATION ERROR:",error.message);
res.status(500).json({
success:false,
message:"Unable to verify authentication."
});
return null;
}
}

async function getAdministrator(req,res){
const user=await getAuthenticatedUser(req,res);

if(!user)return null;

if(String(user.role).toUpperCase()!=="ADMIN"){
res.status(403).json({
success:false,
message:"Only administrators can manage announcements and articles."
});
return null;
}

return user;
}

async function getStaffMember(req,res){
const user=await getAuthenticatedUser(req,res);

if(!user)return null;

const role=String(user.role).toUpperCase();

if(role!=="STAFF"&&role!=="ADMIN"){
res.status(403).json({
success:false,
message:"Only authorised staff members can submit content."
});
return null;
}

return user;
}

function createSlug(value){
return String(value||"")
.toLowerCase()
.trim()
.replace(/[^a-z0-9]+/g,"-")
.replace(/^-+|-+$/g,"");
}

/* =========================================================
STAFF ANNOUNCEMENTS
========================================================= */

router.post("/staff/announcements",async(req,res)=>{
try{
const staff=await getStaffMember(req,res);
if(!staff)return;

const {title,content,category}=req.body||{};

if(!title||!String(title).trim()){
return res.status(400).json({
success:false,
message:"Announcement title is required."
});
}

if(!content||!String(content).trim()){
return res.status(400).json({
success:false,
message:"Announcement content is required."
});
}

const {rows}=await pool.query(
"INSERT INTO announcements (title,content,category,is_published,created_by,created_at,updated_at) VALUES($1,$2,$3,false,$4,NOW(),NOW()) RETURNING *",
[
String(title).trim(),
String(content).trim(),
category?String(category).trim():"General",
staff.id
]
);

return res.status(201).json({
success:true,
message:"Announcement submitted for administrator approval.",
announcement:rows[0]
});

}catch(error){
console.error("STAFF CREATE ANNOUNCEMENT ERROR:",error.message);

return res.status(500).json({
success:false,
message:"Unable to submit announcement."
});
}
});

router.get("/staff/announcements",async(req,res)=>{
try{
const staff=await getStaffMember(req,res);
if(!staff)return;

const {rows}=await pool.query(
"SELECT a.id, a.title, a.content, a.category, a.is_published, a.created_at, a.updated_at, u.full_name AS author_name FROM announcements a LEFT JOIN users u ON a.created_by=u.id WHERE a.created_by=$1 ORDER BY a.created_at DESC",
[staff.id]
);

return res.status(200).json({
success:true,
announcements:rows
});

}catch(error){
console.error("STAFF GET ANNOUNCEMENTS ERROR:",error.message);

return res.status(500).json({
success:false,
message:"Unable to retrieve your announcements."
});
}
});

router.put("/staff/announcements/:id",async(req,res)=>{
try{
const staff=await getStaffMember(req,res);
if(!staff)return;

const {title,content,category}=req.body||{};

if(!title||!String(title).trim()||!content||!String(content).trim()){
return res.status(400).json({
success:false,
message:"Announcement title and content are required."
});
}

const {rows}=await pool.query(
"UPDATE announcements SET title=$1, content=$2, category=$3, updated_at=NOW() WHERE id=$4 AND created_by=$5 AND is_published=false RETURNING *",
[
String(title).trim(),
String(content).trim(),
category?String(category).trim():"General",
req.params.id,
staff.id
]
);

if(!rows[0]){
return res.status(404).json({
success:false,
message:"Pending announcement was not found or can no longer be edited."
});
}

return res.status(200).json({
success:true,
message:"Pending announcement updated successfully.",
announcement:rows[0]
});

}catch(error){
console.error("STAFF UPDATE ANNOUNCEMENT ERROR:",error.message);

return res.status(500).json({
success:false,
message:"Unable to update announcement."
});
}
});

router.delete("/staff/announcements/:id",async(req,res)=>{
try{
const staff=await getStaffMember(req,res);
if(!staff)return;

const {rows}=await pool.query(
"DELETE FROM announcements WHERE id=$1 AND created_by=$2 AND is_published=false RETURNING id,title",
[req.params.id,staff.id]
);

if(!rows[0]){
return res.status(404).json({
success:false,
message:"Pending announcement was not found."
});
}

return res.status(200).json({
success:true,
message:"Pending announcement deleted successfully."
});

}catch(error){
console.error("STAFF DELETE ANNOUNCEMENT ERROR:",error.message);

return res.status(500).json({
success:false,
message:"Unable to delete announcement."
});
}
});

/* =========================================================
STAFF ARTICLES
========================================================= */

router.post("/staff/articles",async(req,res)=>{
try{
const staff=await getStaffMember(req,res);
if(!staff)return;

const {
title,
slug,
excerpt,
content,
category,
featured_image
}=req.body||{};

if(!title||!String(title).trim()){
return res.status(400).json({
success:false,
message:"Article title is required."
});
}

if(!content||!String(content).trim()){
return res.status(400).json({
success:false,
message:"Article content is required."
});
}

const articleSlug=createSlug(
slug&&String(slug).trim()?slug:title
);

const {rows}=await pool.query(
"INSERT INTO articles (title,slug,excerpt,content,category,featured_image,author_id,is_published,published_at,created_at,updated_at) VALUES($1,$2,$3,$4,$5,$6,$7,false,NULL,NOW(),NOW()) RETURNING *",
[
String(title).trim(),
articleSlug,
excerpt?String(excerpt).trim():null,
String(content).trim(),
category?String(category).trim():"General",
featured_image?String(featured_image).trim():null,
staff.id
]
);

return res.status(201).json({
success:true,
message:"Article submitted for administrator approval.",
article:rows[0]
});

}catch(error){
console.error("STAFF CREATE ARTICLE ERROR:",error.message);

if(error.code==="23505"){
return res.status(400).json({
success:false,
message:"An article with this URL slug already exists."
});
}

return res.status(500).json({
success:false,
message:"Unable to submit article."
});
}
});

router.get("/staff/articles",async(req,res)=>{
try{
const staff=await getStaffMember(req,res);
if(!staff)return;

const {rows}=await pool.query(
"SELECT a.id, a.title, a.slug, a.excerpt, a.content, a.category, a.featured_image, a.author_id, a.is_published, a.published_at, a.created_at, a.updated_at, u.full_name AS author_name FROM articles a LEFT JOIN users u ON a.author_id=u.id WHERE a.author_id=$1 ORDER BY a.created_at DESC",
[staff.id]
);

return res.status(200).json({
success:true,
articles:rows
});

}catch(error){
console.error("STAFF GET ARTICLES ERROR:",error.message);

return res.status(500).json({
success:false,
message:"Unable to retrieve your articles."
});
}
});

router.put("/staff/articles/:id",async(req,res)=>{
try{
const staff=await getStaffMember(req,res);
if(!staff)return;

const {
title,
slug,
excerpt,
content,
category,
featured_image
}=req.body||{};

if(!title||!String(title).trim()||!content||!String(content).trim()){
return res.status(400).json({
success:false,
message:"Article title and content are required."
});
}

const articleSlug=createSlug(
slug&&String(slug).trim()?slug:title
);

const {rows}=await pool.query(
"UPDATE articles SET title=$1, slug=$2, excerpt=$3, content=$4, category=$5, featured_image=$6, updated_at=NOW() WHERE id=$7 AND author_id=$8 AND is_published=false RETURNING *",
[
String(title).trim(),
articleSlug,
excerpt?String(excerpt).trim():null,
String(content).trim(),
category?String(category).trim():"General",
featured_image?String(featured_image).trim():null,
req.params.id,
staff.id
]
);

if(!rows[0]){
return res.status(404).json({
success:false,
message:"Pending article was not found or can no longer be edited."
});
}

return res.status(200).json({
success:true,
message:"Pending article updated successfully.",
article:rows[0]
});

}catch(error){
console.error("STAFF UPDATE ARTICLE ERROR:",error.message);

if(error.code==="23505"){
return res.status(400).json({
success:false,
message:"An article with this URL slug already exists."
});
}

return res.status(500).json({
success:false,
message:"Unable to update article."
});
}
});

router.delete("/staff/articles/:id",async(req,res)=>{
try{
const staff=await getStaffMember(req,res);
if(!staff)return;

const {rows}=await pool.query(
"DELETE FROM articles WHERE id=$1 AND author_id=$2 AND is_published=false RETURNING id,title",
[req.params.id,staff.id]
);

if(!rows[0]){
return res.status(404).json({
success:false,
message:"Pending article was not found."
});
}

return res.status(200).json({
success:true,
message:"Pending article deleted successfully."
});

}catch(error){
console.error("STAFF DELETE ARTICLE ERROR:",error.message);

return res.status(500).json({
success:false,
message:"Unable to delete article."
});
}
});

/* =========================================================
ADMIN ANNOUNCEMENTS
========================================================= */

router.post("/announcements",async(req,res)=>{
try{
const administrator=await getAdministrator(req,res);
if(!administrator)return;

const {title,content,category,is_published}=req.body||{};

if(!title||!String(title).trim()){
return res.status(400).json({
success:false,
message:"Announcement title is required."
});
}

if(!content||!String(content).trim()){
return res.status(400).json({
success:false,
message:"Announcement content is required."
});
}

const published=is_published===true;

const {rows}=await pool.query(
"INSERT INTO announcements (title,content,category,is_published,created_by,created_at,updated_at) VALUES($1,$2,$3,$4,$5,NOW(),NOW()) RETURNING *",
[
String(title).trim(),
String(content).trim(),
category?String(category).trim():"General",
published,
administrator.id
]
);

return res.status(201).json({
success:true,
message:"Announcement created successfully.",
announcement:rows[0]
});

}catch(error){
console.error("CREATE ANNOUNCEMENT ERROR:",error.message);

return res.status(500).json({
success:false,
message:"Unable to create announcement."
});
}
});

router.get("/announcements",async(req,res)=>{
try{
const administrator=await getAdministrator(req,res);
if(!administrator)return;

const {rows}=await pool.query(
"SELECT a.id, a.title, a.content, a.category, a.is_published, a.created_at, a.updated_at, u.full_name AS author_name FROM announcements a LEFT JOIN users u ON a.created_by=u.id ORDER BY a.created_at DESC"
);

return res.status(200).json({
success:true,
announcements:rows
});

}catch(error){
console.error("GET ANNOUNCEMENTS ERROR:",error.message);

return res.status(500).json({
success:false,
message:"Unable to retrieve announcements."
});
}
});

router.get("/announcements/:id",async(req,res)=>{
try{
const administrator=await getAdministrator(req,res);
if(!administrator)return;

const {rows}=await pool.query(
"SELECT a.*, u.full_name AS author_name FROM announcements a LEFT JOIN users u ON a.created_by=u.id WHERE a.id=$1 LIMIT 1",
[req.params.id]
);

if(!rows[0]){
return res.status(404).json({
success:false,
message:"Announcement was not found."
});
}

return res.status(200).json({
success:true,
announcement:rows[0]
});

}catch(error){
console.error("GET ANNOUNCEMENT ERROR:",error.message);

return res.status(500).json({
success:false,
message:"Unable to retrieve announcement."
});
}
});

router.put("/announcements/:id",async(req,res)=>{
try{
const administrator=await getAdministrator(req,res);
if(!administrator)return;

const {title,content,category,is_published}=req.body||{};

if(!title||!String(title).trim()){
return res.status(400).json({
success:false,
message:"Announcement title is required."
});
}

if(!content||!String(content).trim()){
return res.status(400).json({
success:false,
message:"Announcement content is required."
});
}

const published=is_published===true;

const {rows}=await pool.query(
"UPDATE announcements SET title=$1, content=$2, category=$3, is_published=$4, updated_at=NOW() WHERE id=$5 RETURNING *",
[
String(title).trim(),
String(content).trim(),
category?String(category).trim():"General",
published,
req.params.id
]
);

if(!rows[0]){
return res.status(404).json({
success:false,
message:"Announcement was not found."
});
}

return res.status(200).json({
success:true,
message:published?"Announcement approved and published successfully.":"Announcement updated successfully.",
announcement:rows[0]
});

}catch(error){
console.error("UPDATE ANNOUNCEMENT ERROR:",error.message);

return res.status(500).json({
success:false,
message:"Unable to update announcement."
});
}
});

router.delete("/announcements/:id",async(req,res)=>{
try{
const administrator=await getAdministrator(req,res);
if(!administrator)return;

const {rows}=await pool.query(
"DELETE FROM announcements WHERE id=$1 RETURNING id,title",
[req.params.id]
);

if(!rows[0]){
return res.status(404).json({
success:false,
message:"Announcement was not found."
});
}

return res.status(200).json({
success:true,
message:"Announcement rejected and deleted successfully."
});

}catch(error){
console.error("DELETE ANNOUNCEMENT ERROR:",error.message);

return res.status(500).json({
success:false,
message:"Unable to delete announcement."
});
}
});

/* =========================================================
ADMIN ARTICLES
========================================================= */

router.post("/articles",async(req,res)=>{
try{
const administrator=await getAdministrator(req,res);
if(!administrator)return;

const {
title,
slug,
excerpt,
content,
category,
featured_image,
is_published
}=req.body||{};

if(!title||!String(title).trim()){
return res.status(400).json({
success:false,
message:"Article title is required."
});
}

if(!content||!String(content).trim()){
return res.status(400).json({
success:false,
message:"Article content is required."
});
}

const articleSlug=createSlug(
slug&&String(slug).trim()?slug:title
);

const published=is_published===true;

const {rows}=await pool.query(
"INSERT INTO articles (title,slug,excerpt,content,category,featured_image,author_id,is_published,published_at,created_at,updated_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,NOW(),NOW()) RETURNING *",
[
String(title).trim(),
articleSlug,
excerpt?String(excerpt).trim():null,
String(content).trim(),
category?String(category).trim():"General",
featured_image?String(featured_image).trim():null,
administrator.id,
published,
published?new Date():null
]
);

return res.status(201).json({
success:true,
message:"Article created successfully.",
article:rows[0]
});

}catch(error){
console.error("CREATE ARTICLE ERROR:",error.message);

if(error.code==="23505"){
return res.status(400).json({
success:false,
message:"An article with this URL slug already exists."
});
}

return res.status(500).json({
success:false,
message:"Unable to create article."
});
}
});

router.get("/articles",async(req,res)=>{
try{
const administrator=await getAdministrator(req,res);
if(!administrator)return;

const {rows}=await pool.query(
"SELECT a.id, a.title, a.slug, a.excerpt, a.category, a.featured_image, a.is_published, a.published_at, a.created_at, a.updated_at, u.full_name AS author_name FROM articles a LEFT JOIN users u ON a.author_id=u.id ORDER BY a.created_at DESC"
);

return res.status(200).json({
success:true,
articles:rows
});

}catch(error){
console.error("GET ARTICLES ERROR:",error.message);

return res.status(500).json({
success:false,
message:"Unable to retrieve articles."
});
}
});

router.get("/articles/:id",async(req,res)=>{
try{
const administrator=await getAdministrator(req,res);
if(!administrator)return;

const {rows}=await pool.query(
"SELECT a.*, u.full_name AS author_name FROM articles a LEFT JOIN users u ON a.author_id=u.id WHERE a.id=$1 LIMIT 1",
[req.params.id]
);

if(!rows[0]){
return res.status(404).json({
success:false,
message:"Article was not found."
});
}

return res.status(200).json({
success:true,
article:rows[0]
});

}catch(error){
console.error("GET ARTICLE ERROR:",error.message);

return res.status(500).json({
success:false,
message:"Unable to retrieve article."
});
}
});

router.put("/articles/:id",async(req,res)=>{
try{
const administrator=await getAdministrator(req,res);
if(!administrator)return;

const {
title,
slug,
excerpt,
content,
category,
featured_image,
is_published
}=req.body||{};

if(!title||!String(title).trim()){
return res.status(400).json({
success:false,
message:"Article title is required."
});
}

if(!content||!String(content).trim()){
return res.status(400).json({
success:false,
message:"Article content is required."
});
}

const articleSlug=createSlug(
slug&&String(slug).trim()?slug:title
);

const published=is_published===true;

const {rows}=await pool.query(
"UPDATE articles SET title=$1, slug=$2, excerpt=$3, content=$4, category=$5, featured_image=$6, is_published=$7, published_at=CASE WHEN $7=true AND published_at IS NULL THEN NOW() WHEN $7=false THEN NULL ELSE published_at END, updated_at=NOW() WHERE id=$8 RETURNING *",
[
String(title).trim(),
articleSlug,
excerpt?String(excerpt).trim():null,
String(content).trim(),
category?String(category).trim():"General",
featured_image?String(featured_image).trim():null,
published,
req.params.id
]
);

if(!rows[0]){
return res.status(404).json({
success:false,
message:"Article was not found."
});
}

return res.status(200).json({
success:true,
message:published?"Article approved and published successfully.":"Article updated successfully.",
article:rows[0]
});

}catch(error){
console.error("UPDATE ARTICLE ERROR:",error.message);

if(error.code==="23505"){
return res.status(400).json({
success:false,
message:"An article with this URL slug already exists."
});
}

return res.status(500).json({
success:false,
message:"Unable to update article."
});
}
});

router.delete("/articles/:id",async(req,res)=>{
try{
const administrator=await getAdministrator(req,res);
if(!administrator)return;

const {rows}=await pool.query(
"DELETE FROM articles WHERE id=$1 RETURNING id,title",
[req.params.id]
);

if(!rows[0]){
return res.status(404).json({
success:false,
message:"Article was not found."
});
}

return res.status(200).json({
success:true,
message:"Article rejected and deleted successfully."
});

}catch(error){
console.error("DELETE ARTICLE ERROR:",error.message);

return res.status(500).json({
success:false,
message:"Unable to delete article."
});
}
});

module.exports=router;
