const express=require("express");
const supabase=require("../supabase");
const pool=require("../db");
const router=express.Router();

async function getAuthenticatedUser(req,res){
try{
const token=req.headers.authorization?.replace("Bearer ","");
if(!token)return res.status(401).json({success:false,message:"Authorization token is required."}),null;
const {data,error}=await supabase.auth.getUser(token);
if(error||!data?.user)return res.status(401).json({success:false,message:"Invalid or expired session."}),null;
const {rows}=await pool.query("SELECT id,full_name,username,email,role,is_active FROM users WHERE id=$1 LIMIT 1",[data.user.id]);
const user=rows[0];
if(!user)return res.status(403).json({success:false,message:"Your account is not registered in the Kenbridge staff system."}),null;
if(!user.is_active)return res.status(403).json({success:false,message:"Your account is inactive."}),null;
return user;
}catch(error){
console.error("CONTENT AUTHENTICATION ERROR:",error.message);
return res.status(500).json({success:false,message:"Unable to verify your account."}),null;
}
}

async function getAdministrator(req,res){
const user=await getAuthenticatedUser(req,res);
if(!user||!isAdmin(user))return res.status(403).json({success:false,message:"Only administrators can perform this action."}),null;
return user;
}

function isAdmin(user){return String(user?.role||"").toUpperCase()==="ADMIN";}
function createSlug(value){return String(value).toLowerCase().trim().replace(/[^a-z0-9]+/g,"-").replace(/^-+|-+$/g,"");}

router.post("/announcements",async(req,res)=>{
try{
const user=await getAuthenticatedUser(req,res);if(!user)return;
const {title,content,category,is_published}=req.body||{};
if(!title?.trim())return res.status(400).json({success:false,message:"Announcement title is required."});
if(!content?.trim())return res.status(400).json({success:false,message:"Announcement content is required."});
const published=isAdmin(user)&&is_published===true;
const {rows}=await pool.query(`INSERT INTO announcements(title,body,category,published,is_published,created_by,created_at,updated_at) VALUES($1,$2,$3,$4,$4,$5,NOW(),NOW()) RETURNING *`,[title.trim(),content.trim(),category?.trim()||"General",published,user.id]);
res.status(201).json({success:true,message:isAdmin(user)?"Announcement created successfully.":"Announcement submitted for administrator approval.",announcement:{...rows[0],content:rows[0].body}});
}catch(error){console.error("CREATE ANNOUNCEMENT ERROR:",error.message);res.status(500).json({success:false,message:"Unable to create announcement."});}
});

router.get("/announcements",async(req,res)=>{
try{
const user=await getAuthenticatedUser(req,res);if(!user)return;
let query=`SELECT a.id,a.title,a.body AS content,a.category,a.published,a.is_published,a.created_at,a.updated_at,u.full_name AS author_name FROM announcements a LEFT JOIN users u ON a.created_by=u.id`;
const params=isAdmin(user)?[]:[user.id];
if(params.length)query+=" WHERE a.created_by=$1";
const {rows}=await pool.query(query+" ORDER BY a.created_at DESC",params);
res.json({success:true,announcements:rows});
}catch(error){console.error("GET ANNOUNCEMENTS ERROR:",error.message);res.status(500).json({success:false,message:"Unable to retrieve announcements."});}
});

router.get("/announcements/:id",async(req,res)=>{
try{
const user=await getAuthenticatedUser(req,res);if(!user)return;
let query=`SELECT a.id,a.title,a.body AS content,a.category,a.published,a.is_published,a.created_by,a.created_at,a.updated_at,u.full_name AS author_name FROM announcements a LEFT JOIN users u ON a.created_by=u.id WHERE a.id=$1`;
const params=[req.params.id];
if(!isAdmin(user)){query+=" AND a.created_by=$2";params.push(user.id);}
const {rows}=await pool.query(query+" LIMIT 1",params);
if(!rows[0])return res.status(404).json({success:false,message:"Announcement was not found."});
res.json({success:true,announcement:rows[0]});
}catch(error){console.error("GET ANNOUNCEMENT ERROR:",error.message);res.status(500).json({success:false,message:"Unable to retrieve announcement."});}
});

router.put("/announcements/:id",async(req,res)=>{
try{
const user=await getAuthenticatedUser(req,res);if(!user)return;
const {title,content,category,is_published}=req.body||{};
if(!title?.trim())return res.status(400).json({success:false,message:"Announcement title is required."});
if(!content?.trim())return res.status(400).json({success:false,message:"Announcement content is required."});
const admin=isAdmin(user),published=admin&&is_published===true;
const query=admin?`UPDATE announcements SET title=$1,body=$2,category=$3,published=$4,is_published=$4,updated_at=NOW() WHERE id=$5 RETURNING *`:`UPDATE announcements SET title=$1,body=$2,category=$3,published=false,is_published=false,updated_at=NOW() WHERE id=$4 AND created_by=$5 AND is_published=false RETURNING *`;
const params=admin?[title.trim(),content.trim(),category?.trim()||"General",published,req.params.id]:[title.trim(),content.trim(),category?.trim()||"General",req.params.id,user.id];
const {rows}=await pool.query(query,params);
if(!rows[0])return res.status(404).json({success:false,message:admin?"Announcement was not found.":"You can only edit your own pending announcements."});
res.json({success:true,message:admin?"Announcement updated successfully.":"Announcement updated and remains pending administrator approval.",announcement:{...rows[0],content:rows[0].body}});
}catch(error){console.error("UPDATE ANNOUNCEMENT ERROR:",error.message);res.status(500).json({success:false,message:"Unable to update announcement."});}
});

router.delete("/announcements/:id",async(req,res)=>{
try{
const user=await getAuthenticatedUser(req,res);if(!user)return;
const admin=isAdmin(user),query=admin?"DELETE FROM announcements WHERE id=$1 RETURNING id":"DELETE FROM announcements WHERE id=$1 AND created_by=$2 AND is_published=false RETURNING id",params=admin?[req.params.id]:[req.params.id,user.id];
const {rows}=await pool.query(query,params);
if(!rows[0])return res.status(404).json({success:false,message:admin?"Announcement was not found.":"You can only delete your own pending announcements."});
res.json({success:true,message:"Announcement deleted successfully."});
}catch(error){console.error("DELETE ANNOUNCEMENT ERROR:",error.message);res.status(500).json({success:false,message:"Unable to delete announcement."});}
});

router.post("/articles",async(req,res)=>{
try{
const user=await getAuthenticatedUser(req,res);if(!user);
const {title,slug,excerpt,content,category,featured_image,is_published}=req.body||{};
if(!title?.trim())return res.status(400).json({success:false,message:"Article title is required."});
if(!content?.trim())return res.status(400).json({success:false,message:"Article content is required."});
const admin=isAdmin(user),published=admin&&is_published===true;
const {rows}=await pool.query(`INSERT INTO articles(title,slug,excerpt,content,category,featured_image,author_id,is_published,published_at,created_at,updated_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,NOW(),NOW()) RETURNING *`,[title.trim(),createSlug(slug?.trim()||title),excerpt?.trim()||null,content.trim(),category?.trim()||"General",featured_image?.trim()||null,user.id,published,published?new Date():null]);
res.status(201).json({success:true,message:admin?"Article created successfully.":"Article submitted for administrator approval.",article:rows[0]});
}catch(error){console.error("CREATE ARTICLE ERROR:",error.message);res.status(error.code==="23505"?400:500).json({success:false,message:error.code==="23505"?"An article with this URL slug already exists.":"Unable to create article."});}
});

router.get("/articles",async(req,res)=>{
try{
const user=await getAuthenticatedUser(req,res);if(!user)return;
let query=`SELECT a.id,a.title,a.slug,a.excerpt,a.content,a.category,a.featured_image,a.is_published,a.published_at,a.created_at,a.updated_at,u.full_name AS author_name FROM articles a LEFT JOIN users u ON a.author_id=u.id`;
const params=isAdmin(user)?[]:[user.id];
if(params.length)query+=" WHERE a.author_id=$1";
const {rows}=await pool.query(query+" ORDER BY a.created_at DESC",params);
res.json({success:true,articles:rows});
}catch(error){console.error("GET ARTICLES ERROR:",error.message);res.status(500).json({success:false,message:"Unable to retrieve articles."});}
});

router.get("/articles/:id",async(req,res)=>{
try{
const user=await getAuthenticatedUser(req,res);if(!user)return;
let query=`SELECT a.*,u.full_name AS author_name FROM articles a LEFT JOIN users u ON a.author_id=u.id WHERE a.id=$1`;
const params=[req.params.id];
if(!isAdmin(user)){query+=" AND a.author_id=$2";params.push(user.id);}
const {rows}=await pool.query(query+" LIMIT 1",params);
if(!rows[0])return res.status(404).json({success:false,message:"Article was not found."});
res.json({success:true,article:rows[0]});
}catch(error){console.error("GET ARTICLE ERROR:",error.message);res.status(500).json({success:false,message:"Unable to retrieve article."});}
});

router.put("/articles/:id",async(req,res)=>{
try{
const user=await getAuthenticatedUser(req,res);if(!user)return;
const {title,slug,excerpt,content,category,featured_image,is_published}=req.body||{};
if(!title?.trim())return res.status(400).json({success:false,message:"Article title is required."});
if(!content?.trim())return res.status(400).json({success:false,message:"Article content is required."});
const admin=isAdmin(user),base=[title.trim(),createSlug(slug?.trim()||title),excerpt?.trim()||null,content.trim(),category?.trim()||"General",featured_image?.trim()||null];
const query=admin?`UPDATE articles SET title=$1,slug=$2,excerpt=$3,content=$4,category=$5,featured_image=$6,is_published=$7,published_at=CASE WHEN $7=true AND published_at IS NULL THEN NOW() WHEN $7=false THEN NULL ELSE published_at END,updated_at=NOW() WHERE id=$8 RETURNING *`:`UPDATE articles SET title=$1,slug=$2,excerpt=$3,content=$4,category=$5,featured_image=$6,is_published=false,published_at=NULL,updated_at=NOW() WHERE id=$7 AND author_id=$8 AND is_published=false RETURNING *`;
const params=admin?[...base,is_published===true,req.params.id]:[...base,req.params.id,user.id];
const {rows}=await pool.query(query,params);
if(!rows[0])return res.status(404).json({success:false,message:admin?"Article was not found.":"You can only edit your own pending articles."});
res.json({success:true,message:admin?"Article updated successfully.":"Article updated and remains pending administrator approval.",article:rows[0]});
}catch(error){console.error("UPDATE ARTICLE ERROR:",error.message);res.status(error.code==="23505"?400:500).json({success:false,message:error.code==="23505"?"An article with this URL slug already exists.":"Unable to update article."});}
});

router.delete("/articles/:id",async(req,res)=>{
try{
const user=await getAuthenticatedUser(req,res);if(!user)return;
const admin=isAdmin(user),query=admin?"DELETE FROM articles WHERE id=$1 RETURNING id":"DELETE FROM articles WHERE id=$1 AND author_id=$2 AND is_published=false RETURNING id",params=admin?[req.params.id]:[req.params.id,user.id];
const {rows}=await pool.query(query,params);
if(!rows[0])return res.status(404).json({success:false,message:admin?"Article was not found.":"You can only delete your own pending articles."});
res.json({success:true,message:"Article deleted successfully."});
}catch(error){console.error("DELETE ARTICLE ERROR:",error.message);res.status(500).json({success:false,message:"Unable to delete article."});}
});

module.exports=router;
