const express=require("express");
const mysql=require("mysql2");
const nodemailer=require("nodemailer");
const app= express();
const port=4000;
const db=mysql.createConnection({
    host:"localhost",
    user:"root",
    password:"",
    database:"project",

});
db.connect((err)=>{
    if(err){
        console.err("connection failed",err);
    }
    else{
        console.log("connection successfully");
    }
});
app.get("/response",(req,res)=>{
    const sql= "SELECT * FROM api";
    db.query(sql,(err,result)=>{
        if(err){
            console.err("error fetching in database",err);
            return res.status(500).json({error:"error:Database error"});

        }
        res.json(result);
    });
});
//nodemailer SMTP TRANSPORTER
const transporter= nodemailer.createTransport({
    host:"mail.dtecsoftwaresolutions.com",
    port:"465",
    secure:"true",
    auth:{
        user:"demo@dtecsoftwaresolutions.com",
        pass:"pvEpvmFtkBu1GOxg",
    }
    
});
transporter.verify((error,success)=>{
    if(error){
        console.error("SMTP CONNECTION FAIL",error);
    }
    else{
        console.log("SMTP CONNECTION SUCCESSFULLY");
    }
});

app.get("/:color",(req,res) =>{
const color=req.params.color;
//res.send(`welcome ${name}`);
res.json({message:`my favorite color is ,${color}`});
const responsemessage=`my favorite color is,${color}`;
const sql="INSERT INTO api(response) VALUES(?)";


db.query(sql,[responsemessage],(err,result)=>{
    if(err){
        console.err("error inserting in database",err);
        return res.status(500).json({error:"error:Database error"});
                
}
transporter.sendMail({
    from:'" KNAX 250 API infomation<demo@dtecsoftwaresolutions.com>"',
    to:"bonheurhirwa0@gmail.com",
    subject:"API RESPONSE",
    text:`"NEW RESPONSE CREATED:${color}\n\nMessage:${responsemessage}"`,
},(emailErr,info) =>{
    if(emailErr){
        console.error("ERROR",emailErr);
    }
    else{
        console.log("EMAIL SENT",info.response);
    }
}

    );
console.log("message Saved",responsemessage);
    });
});
app.listen(port,()=>{
    console.log(`hello knax ${port}`);
});

