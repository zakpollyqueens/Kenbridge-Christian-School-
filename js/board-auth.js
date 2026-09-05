/* =========================================================
   KENBRIDGE CHRISTIAN SCHOOL
   BOARD OF GOVERNORS AUTHENTICATION
   =========================================================

   SECURITY FLOW:

   1. User logs into Staff Portal.
   2. User must have ADMIN role.
   3. User opens Board of Governors.
   4. Board login asks for ONE password.
   5. Staff ADMIN token is sent silently to the backend.
   6. Backend verifies ADMIN + Board password.
   7. Backend returns a separate Board session token.
   8. Board pages use the separate Board session.

   ========================================================= */

(function(){

  "use strict";

  /* =======================================================
     CONFIGURATION
     ======================================================= */

  const API_BASE=
    "https://kenbridge-christian-school.onrender.com";

  const BOARD_TOKEN_KEY=
    "kenbridgeBoardAccessToken";

  const BOARD_USER_KEY=
    "kenbridgeBoardUser";

  const STAFF_TOKEN_KEY=
    "kenbridgeAccessToken";


  /* =======================================================
     STORAGE HELPERS
     ======================================================= */

  function getStaffToken(){

    return localStorage.getItem(
      STAFF_TOKEN_KEY
    );
  }


  function getBoardToken(){

    return localStorage.getItem(
      BOARD_TOKEN_KEY
    );
  }


  function getStoredBoardUser(){

    try{

      const raw=
        localStorage.getItem(
          BOARD_USER_KEY
        );

      return raw?
        JSON.parse(raw):
        null;

    }catch(error){

      return null;
    }
  }


  function saveBoardSession(
    token,
    user
  ){

    localStorage.setItem(
      BOARD_TOKEN_KEY,
      token
    );

    if(user){

      localStorage.setItem(
        BOARD_USER_KEY,
        JSON.stringify(user)
      );
    }
  }


  function clearBoardSession(){

    localStorage.removeItem(
      BOARD_TOKEN_KEY
    );

    localStorage.removeItem(
      BOARD_USER_KEY
    );
  }


  /* =======================================================
     STAFF ADMIN SESSION CHECK
     ======================================================= */

  async function verifyStaffAdmin(){

    const staffToken=
      getStaffToken();

    if(!staffToken){

      return {
        authenticated:false,
        isAdmin:false,
        user:null
      };
    }

    try{

      const response=
        await fetch(
          `${API_BASE}/api/auth/me`,
          {
            method:"GET",

            headers:{
              "Authorization":
                `Bearer ${staffToken}`,
              "Accept":
                "application/json"
            },

            cache:"no-store"
          }
        );

      if(!response.ok){

        return {
          authenticated:false,
          isAdmin:false,
          user:null
        };
      }

      const data=
        await response.json();

      const user=
        data?.user||
        data?.data||
        null;

      const role=
        String(
          user?.role||
          ""
        ).toUpperCase();

      return {
        authenticated:true,
        isAdmin:
          role==="ADMIN",
        user
      };

    }catch(error){

      console.error(
        "STAFF ADMIN VERIFICATION ERROR:",
        error
      );

      return {
        authenticated:false,
        isAdmin:false,
        user:null
      };
    }
  }


  /* =======================================================
     BOARD LOGIN
     ======================================================= */

  async function login(password){

    const cleanPassword=
      String(
        password||""
      );

    if(!cleanPassword){

      throw new Error(
        "Please enter the Board password."
      );
    }

    /*
       The Board login cannot work without an
       already authenticated Staff session.
    */

    const staffToken=
      getStaffToken();

    if(!staffToken){

      throw new Error(
        "Please sign in to the Staff Portal as an administrator first."
      );
    }


    /*
       Send the Staff ADMIN token invisibly.
       The user only enters the Board password.
    */

    let response;

    try{

      response=
        await fetch(
          `${API_BASE}/api/board/login`,
          {
            method:"POST",

            headers:{
              "Content-Type":
                "application/json",

              "Authorization":
                `Bearer ${staffToken}`,

              "Accept":
                "application/json"
            },

            body:
              JSON.stringify({
                password:
                  cleanPassword
              }),

            cache:"no-store"
          }
        );

    }catch(error){

      console.error(
        "BOARD LOGIN NETWORK ERROR:",
        error
      );

      throw new Error(
        "Unable to connect to the Board Portal server. Please try again."
      );
    }


    let data={};

    try{

      data=
        await response.json();

    }catch(error){

      data={};
    }


    if(!response.ok){

      throw new Error(
        data?.message||
        "Board login failed."
      );
    }


    const token=
      data?.access_token||
      data?.token||
      null;

    if(!token){

      throw new Error(
        "Board login succeeded but no Board session was returned."
      );
    }


    saveBoardSession(
      token,
      data?.user||
      null
    );


    return {
      success:true,
      access_token:token,
      user:
        data?.user||
        null
    };
  }


  /* =======================================================
     GET CURRENT BOARD USER
     ======================================================= */

  async function getCurrentUser(){

    const token=
      getBoardToken();

    if(!token){

      return null;
    }

    try{

      const response=
        await fetch(
          `${API_BASE}/api/board/me`,
          {
            method:"GET",

            headers:{
              "Authorization":
                `Bearer ${token}`,

              "Accept":
                "application/json"
            },

            cache:"no-store"
          }
        );


      if(!response.ok){

        /*
           A 401/403 means the Board session is
           no longer valid.
        */

        if(
          response.status===401||
          response.status===403
        ){

          clearBoardSession();
        }

        return null;
      }


      const data=
        await response.json();

      const user=
        data?.user||
        null;


      if(user){

        localStorage.setItem(
          BOARD_USER_KEY,
          JSON.stringify(user)
        );
      }

      return user;

    }catch(error){

      console.error(
        "BOARD USER CHECK ERROR:",
        error
      );

      return null;
    }
  }


  /* =======================================================
     REQUIRE BOARD ACCESS
     ======================================================= */

  async function requireBoard(
    options={}
  ){

    const redirect=
      options.redirect!==false;


    /*
       First make sure the Staff Portal session exists.
    */

    const staff=
      await verifyStaffAdmin();


    if(
      !staff.authenticated||
      !staff.isAdmin
    ){

      clearBoardSession();

      if(redirect){

        window.location.href=
          "../staff/login.html";
      }

      return null;
    }


    /*
       Then verify the separate Board session.
    */

    const boardToken=
      getBoardToken();


    if(!boardToken){

      if(redirect){

        window.location.href=
          "login.html";
      }

      return null;
    }


    const user=
      await getCurrentUser();


    if(!user){

      clearBoardSession();

      if(redirect){

        window.location.href=
          "login.html";
      }

      return null;
    }


    /*
       The backend is authoritative, but we also
       perform a client-side role check.
    */

    const role=
      String(
        user?.role||
        ""
      ).toUpperCase();


    if(role!=="ADMIN"){

      clearBoardSession();

      if(redirect){

        window.location.href=
          "../staff/login.html";
      }

      return null;
    }


    return user;
  }


  /* =======================================================
     LOGOUT
     ======================================================= */

  async function logout(){

    const token=
      getBoardToken();


    if(token){

      try{

        await fetch(
          `${API_BASE}/api/board/logout`,
          {
            method:"POST",

            headers:{
              "Authorization":
                `Bearer ${token}`,

              "Accept":
                "application/json"
            },

            cache:"no-store"
          }
        );

      }catch(error){

        console.warn(
          "BOARD LOGOUT REQUEST FAILED:",
          error
        );
      }
    }


    clearBoardSession();
  }


  /* =======================================================
     AUTHENTICATED FETCH HELPER
     ======================================================= */

  async function apiFetch(
    endpoint,
    options={}
  ){

    const token=
      getBoardToken();


    if(!token){

      throw new Error(
        "Board session is required."
      );
    }


    const headers={
      ...(options.headers||{}),

      "Authorization":
        `Bearer ${token}`,

      "Accept":
        "application/json"
    };


    /*
       Only add JSON content type when a body exists
       and the caller has not already specified one.
    */

    if(
      options.body&&
      !headers["Content-Type"]
    ){

      headers["Content-Type"]=
        "application/json";
    }


    const response=
      await fetch(
        endpoint.startsWith("http")?
          endpoint:
          `${API_BASE}${endpoint}`,
        {
          ...options,
          headers,
          cache:"no-store"
        }
      );


    if(
      response.status===401||
      response.status===403
    ){

      clearBoardSession();
    }


    return response;
  }


  /* =======================================================
     EXPOSE PUBLIC API
     ======================================================= */

  window.KenbridgeBoardAuth={

    API_BASE,

    BOARD_TOKEN_KEY,

    BOARD_USER_KEY,

    STAFF_TOKEN_KEY,

    getStaffToken,

    getBoardToken,

    getStoredBoardUser,

    saveBoardSession,

    clearBoardSession,

    verifyStaffAdmin,

    login,

    getCurrentUser,

    requireBoard,

    logout,

    apiFetch
  };

})();
