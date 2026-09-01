require("dotenv").config();

const express=require("express");
const cors=require("cors");
const pool=require("./db");

const dashboardRoutes=require("./routes/dashboard");
const authRoutes=require("./routes/auth");
const contentRoutes=require("./routes/content");
const staffContentRoutes=require("./routes/staff-content");
const tasksRoutes=require("./routes/tasks");
const reportsRoutes=require("./routes/reports");
const galleryRoutes=require("./routes/gallery");
const publicContentRoutes=require("./routes/public-content");
const notificationsRoutes=require("./routes/notifications");
const app=express();

const PORT=process.env.PORT||5000;

app.use(cors({
  origin:process.env.CORS_ORIGIN||"*",
  methods:["GET","POST","PUT","PATCH","DELETE","OPTIONS"],
  allowedHeaders:["Content-Type","Authorization"]
}));

app.use(express.json({
  limit:"2mb"
}));

app.use((req,res,next)=>{
  console.log(`[REQUEST] ${req.method} ${req.originalUrl}`);
  next();
});

app.get("/",(req,res)=>{
  res.status(200).json({
    success:true,
    message:"Kenbridge Christian School API is running."
  });
});

app.get("/api/health",(req,res)=>{
  res.status(200).json({
    success:true,
    status:"healthy",
    service:"Kenbridge Backend",
    timestamp:new Date().toISOString()
  });
});

app.get("/api/health/database",async(req,res)=>{
  try{
    const result=await pool.query(
      "SELECT NOW() AS current_time"
    );

    res.status(200).json({
      success:true,
      database:"connected",
      time:result.rows[0].current_time
    });

  }catch(error){
    console.error(
      "DATABASE CONNECTION ERROR:",
      error.message
    );

    res.status(500).json({
      success:false,
      database:"disconnected",
      message:"Database connection failed."
    });
  }
});

app.use("/api/auth",authRoutes);

app.use("/api/content",contentRoutes);

app.use("/api/staff-content",staffContentRoutes);

app.use("/api/tasks",tasksRoutes);
app.use("/api/dashboard",dashboardRoutes);
app.use("/api/notifications",notificationsRoutes);
app.use("/api/public",publicContentRoutes);
app.use("/api/reports",reportsRoutes);
app.use("/api/gallery",galleryRoutes);
app.use((req,res)=>{
  console.log(
    `[404 NOT FOUND] ${req.method} ${req.originalUrl}`
  );

  res.status(404).json({
    success:false,
    message:"API endpoint not found.",
    path:req.originalUrl
  });
});

app.use((error,req,res,next)=>{
  console.error(
    "GLOBAL SERVER ERROR:",
    error
  );

  if(res.headersSent){
    return next(error);
  }

  res.status(500).json({
    success:false,
    message:"An unexpected server error occurred."
  });
});

app.listen(PORT,"0.0.0.0",()=>{
  console.log(
    `Kenbridge backend running on port ${PORT}`
  );
});
