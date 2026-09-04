(function(){
"use strict";

const API_BASE=window.KENBRIDGE_API_BASE||"";
const TOKEN_KEY="kenbridgeAccessToken";
const USER_KEY="kenbridgeUser";

function getToken(){
 return localStorage.getItem(TOKEN_KEY);
}

function getUser(){
 try{
  const raw=localStorage.getItem(USER_KEY);
  return raw?JSON.parse(raw):null;
 }catch{
  return null;
 }
}

function setUser(user){
 localStorage.setItem(USER_KEY,JSON.stringify(user));
}

function clearSession(){
 localStorage.removeItem(TOKEN_KEY);
 localStorage.removeItem(USER_KEY);
}

function authHeaders(){
 const token=getToken();
 return token?{
  "Authorization":`Bearer ${token}`,
  "Content-Type":"application/json"
 }:{
  "Content-Type":"application/json"
 };
}

function apiUrl(path){
 if(/^https?:\/\//i.test(path))return path;
 return `${API_BASE}${path}`;
}

async function request(path,options={}){
 const response=await fetch(apiUrl(path),{
  ...options,
  headers:{
   ...authHeaders(),
   ...(options.headers||{})
  }
 });

 let data=null;

 try{
  data=await response.json();
 }catch{}

 if(!response.ok){
  const error=new Error(
   data?.message||
   `Request failed with status ${response.status}`
  );
  error.status=response.status;
  error.data=data;
  throw error;
 }

 return data;
}

function allowedRole(role){
 role=String(role||"").toUpperCase();
 return role==="BOARD"||role==="ADMIN";
}

async function getCurrentUser(){
 const data=await request("/api/auth/me");

 if(!data?.success||!data?.user){
  throw new Error("Unable to verify your Kenbridge account.");
 }

 const user=data.user;

 if(!allowedRole(user.role)){
  const error=new Error(
   "This account does not have Board of Governors access."
  );
  error.status=403;
  throw error;
 }

 setUser(user);

 return user;
}

async function login(email,password){
 const response=await fetch(apiUrl("/api/auth/login"),{
  method:"POST",
  headers:{
   "Content-Type":"application/json"
  },
  body:JSON.stringify({
   email:String(email||"").trim(),
   password:String(password||"")
  })
 });

 let data=null;

 try{
  data=await response.json();
 }catch{}

 if(!response.ok||!data?.success){
  throw new Error(
   data?.message||
   "Unable to sign in. Please check your login details."
  );
 }

 const token=
  data?.access_token||
  data?.token||
  data?.session?.access_token;

 if(!token){
  throw new Error(
   "Login succeeded but no access token was returned."
  );
 }

 localStorage.setItem(TOKEN_KEY,token);

 if(data?.user)setUser(data.user);

 const user=await getCurrentUser();

 return user;
}

async function requireBoard(options={}){
 const{
  redirect=true,
  loginPath="login.html"
 }=options;

 const token=getToken();

 if(!token){
  if(redirect){
   window.location.replace(loginPath);
  }
  return null;
 }

 try{
  return await getCurrentUser();
 }catch(error){
  if(error.status===401||error.status===403){
   clearSession();
  }

  if(redirect){
   window.location.replace(loginPath);
  }

  return null;
 }
}

async function logout(options={}){
 const{
  redirect=true,
  loginPath="login.html"
 }=options;

 try{
  await request("/api/auth/logout",{
   method:"POST"
  });
 }catch{}

 clearSession();

 if(redirect){
  window.location.replace(loginPath);
 }
}

window.KenbridgeBoardAuth={
 getToken,
 getUser,
 setUser,
 clearSession,
 authHeaders,
 request,
 getCurrentUser,
 login,
 requireBoard,
 logout,
 allowedRole
};

})();
