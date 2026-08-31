const express=require("express");
const supabase=require("../supabase");
const pool=require("../db");

const router=express.Router();

async function getAdministrator(req,res){
try{
const authorization=req.headers.authorization;

if(!authorization||!authorization.startsWith("Bearer ")){
res.status(401).json({
success:false,
message:"Administrator authorization token is required."
});
return null;
}

const token=authorization.replace("Bearer ","");

const {data,error}=await supabase.auth.getUser(token);

if(error||!data?.user){
res.status(401).json({
success:false,
message:"Invalid or expired administrator session."
});
return null;
}

const {rows}=await pool.query(
`SELECT id,full_name,email,role,is_active
FROM users
WHERE id=$1
LIMIT 1`,
[data.user.id]
);

const administrator=rows[0];

if(!administrator){
res.status(403).json({
success:false,
message:"Administrator profile was not found."
});
return null;
}

if(!administrator.is_active){
res.status(403).json({
success:false,
message:"Your administrator account is inactive."
});
return null;
}

if(String(administrator.role).toUpperCase()!=="ADMIN"){
res.status(403).json({
success:false,
message:"Only administrators can manage announcements and articles."
});
return null;
}

return administrator;

}catch(error){
console.error("CONTENT AUTHORIZATION ERROR:",error.message);

res.status(500).json({
success:false,
message:"Unable to verify administrator authorization."
});

return null;
}
}

/* =========================
ANNOUNCEMENTS
========================= */

/* CREATE ANNOUNCEMENT */

router.post("/announcements",async(req,res)=>{

try{

const administrator=await getAdministrator(req,res);

if(!administrator)return;

const {
title,
content,
category,
is_published
}=req.body||{};

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
`INSERT INTO announcements
(title,content,category,is_published,created_by,created_at,updated_at)
VALUES($1,$2,$3,$4,$5,NOW(),NOW())
RETURNING *`,
[
String(title).trim(),
String(content).trim(),
category?String(category).trim():"General",
is_published!==false,
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


/* GET ALL ANNOUNCEMENTS */

router.get("/announcements",async(req,res)=>{

try{

const administrator=await getAdministrator(req,res);

if(!administrator)return;

const {rows}=await pool.query(
`SELECT
a.id,
a.title,
a.content,
a.category,
a.is_published,
a.created_at,
a.updated_at,
u.full_name AS author_name
FROM announcements a
LEFT JOIN users u
ON a.created_by=u.id
ORDER BY a.created_at DESC`
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


/* GET ONE ANNOUNCEMENT */

router.get("/announcements/:id",async(req,res)=>{

try{

const administrator=await getAdministrator(req,res);

if(!administrator)return;

const {rows}=await pool.query(
`SELECT
a.*,
u.full_name AS author_name
FROM announcements a
LEFT JOIN users u
ON a.created_by=u.id
WHERE a.id=$1
LIMIT 1`,
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


/* UPDATE ANNOUNCEMENT */

router.put("/announcements/:id",async(req,res)=>{

try{

const administrator=await getAdministrator(req,res);

if(!administrator)return;

const {
title,
content,
category,
is_published
}=req.body||{};

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
`UPDATE announcements
SET
title=$1,
content=$2,
category=$3,
is_published=$4,
updated_at=NOW()
WHERE id=$5
RETURNING *`,
[
String(title).trim(),
String(content).trim(),
category?String(category).trim():"General",
is_published!==false,
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
message:"Announcement updated successfully.",
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

const administrator=await getAdministrator(req,res);

if(!administrator)return;

const {rows}=await pool.query(
`DELETE FROM announcements
WHERE id=$1
RETURNING id,title`,
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

function createSlug(value){

return String(value)
.toLowerCase()
.trim()
.replace(/[^a-z0-9]+/g,"-")
.replace(/^-+|-+$/g,"");

}


/* CREATE ARTICLE */

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
slug&&String(slug).trim()
?slug
:title
);

const {rows}=await pool.query(
`INSERT INTO articles
(title,slug,excerpt,content,category,featured_image,author_id,is_published,published_at,created_at,updated_at)
VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,NOW(),NOW())
RETURNING *`,
[
String(title).trim(),
articleSlug,
excerpt?String(excerpt).trim():null,
String(content).trim(),
category?String(category).trim():"General",
featured_image?String(featured_image).trim():null,
administrator.id,
is_published===true,
is_published===true?new Date():null
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


/* GET ALL ARTICLES */

router.get("/articles",async(req,res)=>{

try{

const administrator=await getAdministrator(req,res);

if(!administrator)return;

const {rows}=await pool.query(
`SELECT
a.id,
a.title,
a.slug,
a.excerpt,
a.category,
a.featured_image,
a.is_published,
a.published_at,
a.created_at,
a.updated_at,
u.full_name AS author_name
FROM articles a
LEFT JOIN users u
ON a.author_id=u.id
ORDER BY a.created_at DESC`
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


/* GET ONE ARTICLE */

router.get("/articles/:id",async(req,res)=>{

try{

const administrator=await getAdministrator(req,res);

if(!administrator)return;

const {rows}=await pool.query(
`SELECT
a.*,
u.full_name AS author_name
FROM articles a
LEFT JOIN users u
ON a.author_id=u.id
WHERE a.id=$1
LIMIT 1`,
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


/* UPDATE ARTICLE */

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
slug&&String(slug).trim()
?slug
:title
);

const {rows}=await pool.query(
`UPDATE articles
SET
title=$1,
slug=$2,
excerpt=$3,
content=$4,
category=$5,
featured_image=$6,
is_published=$7,
published_at=CASE
WHEN $7=true AND published_at IS NULL THEN NOW()
WHEN $7=false THEN NULL
ELSE published_at
END,
updated_at=NOW()
WHERE id=$8
RETURNING *`,
[
String(title).trim(),
articleSlug,
excerpt?String(excerpt).trim():null,
String(content).trim(),
category?String(category).trim():"General",
featured_image?String(featured_image).trim():null,
is_published===true,
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
message:"Article updated successfully.",
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

const administrator=await getAdministrator(req,res);

if(!administrator)return;

const {rows}=await pool.query(
`DELETE FROM articles
WHERE id=$1
RETURNING id,title`,
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
