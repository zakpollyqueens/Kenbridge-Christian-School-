const express=require("express");
const pool=require("../db");

const router=express.Router();

router.get("/announcements",async(req,res)=>{
try{
const {rows}=await pool.query(
`SELECT
id,
title,
body AS content,
category,
created_at
FROM announcements
WHERE is_published=true
ORDER BY created_at DESC`
);

return res.status(200).json({
success:true,
announcements:rows
});

}catch(error){
console.error(
"GET PUBLIC ANNOUNCEMENTS ERROR:",
error.message
);

return res.status(500).json({
success:false,
message:"Unable to retrieve announcements."
});
}
});


router.get("/articles",async(req,res)=>{
try{
const {rows}=await pool.query(
`SELECT
id,
title,
content,
category,
created_at
FROM articles
WHERE is_published=true
ORDER BY created_at DESC`
);

return res.status(200).json({
success:true,
articles:rows
});

}catch(error){
console.error(
"GET PUBLIC ARTICLES ERROR:",
error.message
);

return res.status(500).json({
success:false,
message:"Unable to retrieve articles."
});
}
});


module.exports=router;
