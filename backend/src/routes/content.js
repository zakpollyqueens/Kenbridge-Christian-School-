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
res.status(403).json({success:false,message:"Your account is not registered in the Kenbridge staff system."});
return null;
}

if(!user.is_active){
res.status(403).json({success:false,message:"Your account is inactive."});
return null;
}

return user;
}catch(error){
console.error("CONTENT AUTHENTICATION ERROR:",error.message);
res.status(500).json({success:false,message:"Unable to verify your account."});
return null;
}
}

async function getAdministrator(req,res){
const user=await getAuthenticatedUser(req,res);
if(!user)return null;

if(String(user.role).toUpperCase()!=="ADMIN"){
res.status(403).json({
success:false,
message:"Only administrators can perform this action."
});
return null;
}

return user;
}

function isAdmin(user){
return String(user?.role||"").toUpperCase()==="ADMIN";
}

function createSlug(value){
return String(value)
.toLowerCase()
.trim()
.replace(/[^a-z0-9]+/g,"-")
.replace(/^-+|-+$/g,"");
}

/* =========================
ANNOUNCEMENTS
========================= */

/* CREATE ANNOUNCEMENT */
router.post("/announcements",async(req,res)=>{
try{
const user=await getAuthenticatedUser(req,res);
if(!user)return;

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

const administrator=isAdmin(user);
const published=administrator&&is_published===true;

const {rows}=await pool.query(
"INSERT INTO announcements (title,content,category,is_published,created_by,created_at,updated_at) VALUES($1,$2,$3,$4,$5,NOW(),NOW()) RETURNING *",
[
String(title).trim(),
String(content).trim(),
category?String(category).trim():"General",
published,
user.id
]
);

return res.status(201).json({
success:true,
message:administrator
?"Announcement created successfully."
:"Announcement submitted for administrator approval.",
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

/* GET ANNOUNCEMENTS */
router.get("/announcements",async(req,res)=>{
try{
const user=await getAuthenticatedUser(req,res);
if(!user)return;

let query;
let params=[];

if(isAdmin(user)){
query=" SELECT a.id, a.title, a.content, a.category, a.is_published, a.created_at, a.updated_at, u.full_name AS author_name FROM announcements a LEFT JOIN users u ON a.created_by=u.id ORDER BY a.created_at DESC";
}else{
query=" SELECT a.id, a.title, a.content, a.category, a.is_published, a.created_at, a.updated_at, u.full_name AS author_name FROM announcements a LEFT JOIN users u ON a.created_by=u.id WHERE a.created_by=$1 ORDER BY a.created_at DESC";
params=[user.id];
}

const {rows}=await pool.query(query,params);

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

/* GET ONE ANNOUNCEMENT */
router.get("/announcements/:id",async(req,res)=>{
try{
const user=await getAuthenticatedUser(req,res);
if(!user)return;

let query;
let params;

if(isAdmin(user)){
query=" SELECT a.*, u.full_name AS author_name FROM announcements a LEFT JOIN users u ON a.created_by=u.id WHERE a.id=$1 LIMIT 1";
params=[req.params.id];
}else{
query=" SELECT a.*, u.full_name AS author_name FROM announcements a LEFT JOIN users u ON a.created_by=u.id WHERE a.id=$1 AND a.created_by=$2 LIMIT 1";
params=[req.params.id,user.id];
}

const {rows}=await pool.query(query,params);

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

/* UPDATE ANNOUNCEMENT */
router.put("/announcements/:id",async(req,res)=>{
try{
const user=await getAuthenticatedUser(req,res);
if(!user)return;

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

let published=isAdmin(user)&&is_published===true;
let query;
let params;

if(isAdmin(user)){
query=" UPDATE announcements SET title=$1, content=$2, category=$3, is_published=$4, updated_at=NOW() WHERE id=$5 RETURNING *";
params=[
String(title).trim(),
String(content).trim(),
category?String(category).trim():"General",
published,
req.params.id
];
}else{
query=" UPDATE announcements SET title=$1, content=$2, category=$3, is_published=false, updated_at=NOW() WHERE id=$4 AND created_by=$5 AND is_published=false RETURNING *";
params=[
String(title).trim(),
String(content).trim(),
category?String(category).trim():"General",
req.params.id,
user.id
];
}

const {rows}=await pool.query(query,params);

if(!rows[0]){
return res.status(404).json({
success:false,
message:isAdmin(user)
?"Announcement was not found."
:"You can only edit your own pending announcements."
});
}

return res.status(200).json({
success:true,
message:isAdmin(user)
?"Announcement updated successfully."
:"Announcement updated and remains pending administrator approval.",
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

/* DELETE ANNOUNCEMENT */
router.delete("/announcements/:id",async(req,res)=>{
try{
const user=await getAuthenticatedUser(req,res);
if(!user)return;

let query;
let params;

if(isAdmin(user)){
query="DELETE FROM announcements WHERE id=$1 RETURNING id,title";
params=[req.params.id];
}else{
query=" DELETE FROM announcements WHERE id=$1 AND created_by=$2 AND is_published=false RETURNING id,title";
params=[req.params.id,user.id];
}

const {rows}=await pool.query(query,params);

if(!rows[0]){
return res.status(404).json({
success:false,
message:isAdmin(user)
?"Announcement was not found."
:"You can only delete your own pending announcements."
});
}

return res.status(200).json({
success:true,
message:"Announcement deleted successfully."
});
}catch(error){
console.error("DELETE ANNOUNCEMENT ERROR:",error.message);
return res.status(500).json({
success:false,
message:"Unable to delete announcement."
});
}
});

/* =========================
ARTICLES
========================= */

/* CREATE ARTICLE */
router.post("/articles",async(req,res)=>{
try{
const user=await getAuthenticatedUser(req,res);
if(!user)return;

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

const administrator=isAdmin(user);
const published=administrator&&is_published===true;

const {rows}=await pool.query(
"INSERT INTO articles (title,slug,excerpt,content,category,featured_image,author_id,is_published,published_at,created_at,updated_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,NOW(),NOW()) RETURNING *",
[
String(title).trim(),
articleSlug,
excerpt?String(excerpt).trim():null,
String(content).trim(),
category?String(category).trim():"General",
featured_image?String(featured_image).trim():null,
user.id,
published,
published?new Date():null
]
);

return res.status(201).json({
success:true,
message:administrator
?"Article created successfully."
:"Article submitted for administrator approval.",
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

/* GET ARTICLES */
router.get("/articles",async(req,res)=>{
try{
const user=await getAuthenticatedUser(req,res);
if(!user)return;

let query;
let params=[];

if(isAdmin(user)){
query=" SELECT a.id, a.title, a.slug, a.excerpt, a.content, a.category, a.featured_image, a.is_published, a.published_at, a.created_at, a.updated_at, u.full_name AS author_name FROM articles a LEFT JOIN users u ON a.author_id=u.id ORDER BY a.created_at DESC";
}else{
query=" SELECT a.id, a.title, a.slug, a.excerpt, a.content, a.category, a.featured_image, a.is_published, a.published_at, a.created_at, a.updated_at, u.full_name AS author_name FROM articles a LEFT JOIN users u ON a.author_id=u.id WHERE a.author_id=$1 ORDER BY a.created_at DESC";
params=[user.id];
}

const {rows}=await pool.query(query,params);

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

/* GET ONE ARTICLE */
router.get("/articles/:id",async(req,res)=>{
try{
const user=await getAuthenticatedUser(req,res);
if(!user)return;

let query;
let params;

if(isAdmin(user)){
query=" SELECT a.*, u.full_name AS author_name FROM articles a LEFT JOIN users u ON a.author_id=u.id WHERE a.id=$1 LIMIT 1";
params=[req.params.id];
}else{
query=" SELECT a.*, u.full_name AS author_name FROM articles a LEFT JOIN users u ON a.author_id=u.id WHERE a.id=$1 AND a.author_id=$2 LIMIT 1";
params=[req.params.id,user.id];
}

const {rows}=await pool.query(query,params);

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

/* UPDATE ARTICLE */
router.put("/articles/:id",async(req,res)=>{
try{
const user=await getAuthenticatedUser(req,res);
if(!user)return;

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

let query;
let params;

if(isAdmin(user)){
query=" UPDATE articles SET title=$1, slug=$2, excerpt=$3, content=$4, category=$5, featured_image=$6, is_published=$7, published_at=CASE WHEN $7=true AND published_at IS NULL THEN NOW() WHEN $7=false THEN NULL ELSE published_at END, updated_at=NOW() WHERE id=$8 RETURNING *";
params=[
String(title).trim(),
articleSlug,
excerpt?String(excerpt).trim():null,
String(content).trim(),
category?String(category).trim():"General",
featured_image?String(featured_image).trim():null,
is_published===true,
req.params.id
];
}else{
query=" UPDATE articles SET title=$1, slug=$2, excerpt=$3, content=$4, category=$5, featured_image=$6, is_published=false, published_at=NULL, updated_at=NOW() WHERE id=$7 AND author_id=$8 AND is_published=false RETURNING *";
params=[
String(title).trim(),
articleSlug,
excerpt?String(excerpt).trim():null,
String(content).trim(),
category?String(category).trim():"General",
featured_image?String(featured_image).trim():null,
req.params.id,
user.id
];
}

const {rows}=await pool.query(query,params);

if(!rows[0]){
return res.status(404).json({
success:false,
message:isAdmin(user)
?"Article was not found."
:"You can only edit your own pending articles."
});
}

return res.status(200).json({
success:true,
message:isAdmin(user)
?"Article updated successfully."
:"Article updated and remains pending administrator approval.",
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

/* DELETE ARTICLE */
router.delete("/articles/:id",async(req,res)=>{
try{
const user=await getAuthenticatedUser(req,res);
if(!user)return;

let query;
let params;

if(isAdmin(user)){
query="DELETE FROM articles WHERE id=$1 RETURNING id,title";
params=[req.params.id];
}else{
query=" DELETE FROM articles WHERE id=$1 AND author_id=$2 AND is_published=false RETURNING id,title";
params=[req.params.id,user.id];
}

const {rows}=await pool.query(query,params);

if(!rows[0]){
return res.status(404).json({
success:false,
message:isAdmin(user)
?"Article was not found."
:"You can only delete your own pending articles."
});
}

return res.status(200).json({
success:true,
message:"Article deleted successfully."
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
