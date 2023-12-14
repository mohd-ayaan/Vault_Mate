import express from "express";
import bodyParser from "body-parser";
import mongoose from "mongoose";
import os from 'os';
import dotenv from 'dotenv';
import session from "express-session";

dotenv.config();
const port =3000;
const app=express();

app.use(express.static("public"));
app.use(bodyParser.urlencoded({extended:true}));
app.use(
    session({
        secret: 'your_secret_key', 
        resave: false,
        saveUninitialized: false,
    })
);
app.set("view engine", "ejs");


mongoose.connect(`mongodb+srv://kshitijkumardubey99:${process.env.DATABASEPASSWORD}@cluster0.bqmvxj7.mongodb.net/vaultmate`);
mongoose.connection.on('connected',() => {
    console.log('Connected to the database');
});

const usersSchema = new mongoose.Schema({
    _id: { type: Number, auto: true },
    Email : String,
    Name: String,
    Password:String,
});
const user = mongoose.model("userDetails", usersSchema);

app.get("/",(req,res)=>{
    res.render("load.ejs");
});
app.get("/about",(req,res)=>{
    res.render("about.ejs");
});
app.get("/contact",(req,res)=>{
    res.render("contact.ejs");
});

app.get("/main",(req,res)=>{
    res.render("start.ejs");
});
app.get("/signup",(req,res)=>{
    res.render("signup.ejs");
});
app.post("/signup",(req,res)=>{
    console.log(req.body);
    const userr = new user({
        _id: req.body.phoneNumber,
        Email : req.body.email,
        Name : req.body.firstName+" "+req.body.lastName,
        Password : req.body.password
    });
    userr.save()
    .then(()=>{
        console.log("New user saved!");
        res.render("gotregistered.ejs");
    }).catch((err)=>{
        console.log(err);
        res.render("useralreadyexits.ejs");
    })
});

app.post("/signin",(req,res)=>{
    console.log(req.body);
    user.findOne({_id:req.body.mobile})
    .then(detail=>{
        console.log(detail);
        if(detail==null){
            res.render("usernotfound.ejs");
        }else if(detail.Password==req.body.password){
            res.redirect("/user");
        }
        else{
            res.render("wrongpassword.ejs");
        }
    })
    .catch(err=>{
        console.log(err);
        res.redirect("/main");
    })
});

app.get("/user",(req,res)=>{
    res.render("main.ejs");
});
app.get("/doc",(req,res)=>{
    res.render("doc.ejs");
});

app.get("/upload",(req,res)=>{
    res.render("upload.ejs");
});
app.get("/preview",(req,res)=>{
    res.render("preview.ejs");
});


let localAddress = 'localhost';

const interfaces = os.networkInterfaces();
Object.keys(interfaces).forEach((interfaceName) => {
    interfaces[interfaceName].forEach((iface) => {
        if (iface.family === 'IPv4' && !iface.internal) {
            localAddress = iface.address;
        }
    });
});


app.listen(port, "0.0.0.0", () => {
    console.log(`Server is running on port ${port}`);
    console.log(`Server is also accessible at http://${localAddress}:${port}`);
});