import express from "express";
import bodyParser from "body-parser";
import os from 'os';
import dotenv from 'dotenv';
import cookieParser from "cookie-parser";
import User from "./models/user_model.js"; // Make sure this path is correct
import Images from "./models/image_model.js";
import save_image_file_service from "./services/save_image_file_service.js";
import generate_token from "./utils/generate_token.js";
import verifyToken from "./middlewares/verifyToken.js"; // Your custom middleware
import multer from "multer";

// Access format: req.file.path (file path on disk) 
// Better for large files
// const storage = multer.diskStorage({
//   destination: function (req, file, cb) {
//     cb(null, 'uploads/'); // folder where files are saved
//   },
//   filename: function (req, file, cb) {
//     cb(null, Date.now() + '-' + file.originalname); // unique filename
//   }
// });


// Store the uploaded file in RAM (not on disk).Faster for small files	
// Access Format: req.file.buffer (base64 or raw)
const storage = multer.memoryStorage();  
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 } // 10MB max
});

dotenv.config();
const port =3000;
const app=express();

app.use(cookieParser());
app.use(express.static("public"));
app.use(bodyParser.urlencoded({extended:true}));
app.set("view engine", "ejs");


// function to render main.ejs with user data
const renderMainPage = async (req, res, userPhoneNumber = null) => {
    let userName = "Vault Mate User";
    let recentDocuments = []; 
    try {   
        let foundUser = null;
        if (userPhoneNumber) {
            foundUser = await User.findOne({ _id: userPhoneNumber });
        } else if (req.user && req.user.user) { // Check if verifyToken populated req.user
            foundUser = await User.findOne({ _id: req.user.user });
        }

        if (foundUser) {
            userName = foundUser.Name;
            // TODO: In a real app, fetch actual recent documents here
            // For now, it remains an empty array or can be hardcoded for testing
        }
    } catch (err) {
        console.error("Error fetching user data for main page:", err);
    }

    res.render("main.ejs", {
        user: { name: userName },
        recentDocuments: recentDocuments
    });
};


// Get routes
app.get("/",(req,res)=>{
    res.render("load.ejs");
});

// Route for logged-in user dashboard (protected by verifyToken)
app.get("/main", verifyToken, async (req, res) => {
    await renderMainPage(req, res, req.user.user); // Pass userPhoneNumber from token
});


app.get("/signin",(req,res)=>{
    res.render("start.ejs");
});

app.get("/signup",(req,res)=>{
    res.render("signup.ejs");
});

app.get("/about",(req,res)=>{
    res.render("about.ejs");
});

app.get("/contact",(req,res)=>{
    res.render("contact.ejs");
});

app.get("/logout", (req, res) => {
    res.clearCookie('authToken');
    res.redirect("/signin");
});

// Post routes
app.post("/signup", (req, res) => {
  console.log(req.body);

  const isValidPhone = /^[6-9]\d{9}$/.test(req.body.phoneNumber);
  if (!isValidPhone) {
    return res.status(400).send("Invalid phone number format");
  }

  const userr = new User({
    _id: req.body.phoneNumber,
    Email: req.body.email,
    Name: req.body.firstName + " " + req.body.lastName,
    Password: req.body.password
  });

  userr.save()
    .then(() => {
      console.log("New user saved!");

      // ✅ Generate token and set cookie
      const token = generate_token({ user: req.body.phoneNumber }, '30m');
      res.cookie('authToken', token, { httpOnly: true });

      res.redirect("/main"); // ✅ Redirect to protected dashboard
    })
    .catch((err) => {
      console.log(err);
      res.render("useralreadyexits.ejs");
    });
});


app.post("/signin",(req,res)=>{
    console.log(req.body);
    User.findOne({_id:req.body.mobile})
    .then(detail=>{
        console.log(detail);
        if(detail==null){
            res.render("usernotfound.ejs");
        }else if(detail.Password==req.body.password){
            const token = generate_token({user:req.body.mobile},'30m');
            res.cookie('authToken', token, { httpOnly: true });
            res.redirect("/main"); // Redirect to the /main route after successful login
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


// Docs route
app.get("/doc/:type", verifyToken, async (req, res) => {
  const userId = req.user.user;
  const rawType = req.params.type;
  const normalizedType = rawType.charAt(0).toUpperCase() + rawType.slice(1).toLowerCase();

  try {
    const user = await User.findOne({ _id: userId });
    const imageId = user?.[normalizedType];
    let mimeType = null;

    if (imageId) {
      const imageDoc = await Images.findById(imageId);
      mimeType = imageDoc?.MimeType || null;
    }

    res.render("doc.ejs", {
      filename: normalizedType,
      mimeType: mimeType || "unknown"
    });
  } catch (err) {
    console.error("Error loading document:", err);
    res.status(500).send("Internal Server Error");
  }
});





// req.file = {
//   fieldname: 'image',
//   originalname: 'passport.jpg',
//   encoding: '7bit',
//   mimetype: 'image/jpeg',
//   buffer: <Buffer ...>, // if using memoryStorage
//   size: 102400
// }

// req.user is a custom property added to the request object by verifyToken middleware, It contains the decoded JWT payload, which includes the user’s phone number (used as _id in MongoDB) for Authentiction.
// req.user={
//   user: "9876543210", // phone number used as _id
//   iat: ..., // issued at
//   exp: ...  // expiry timestamp
// }

// req.params contains route parameters defined in the URL path, These are dynamic segments like :filemode in /upload/:filemode.

// upload.single('image'): Tells Multer to expect one file only, form field named "image"
app.post('/upload/:filemode',upload.single('image'),verifyToken,(req,res)=>{
    // save_image_file_service(file, userID ,feilds)
    save_image_file_service(req.file,req.user.user,req.params.filemode)
    .then(()=>{
        res.redirect('/uploadsucess');
    })
    .catch(()=>{
    })
});


app.get('/image/:filemode',verifyToken,(req,res)=>{
    const user = req.user.user;
    console.log('Image request for user:', user);
    const filename = req.params.filemode;
    User.findOne({_id:user})
    .then(response=>{
        if(response){
            console.log('image requested by'+ user);;
            const file = response[filename];
            Images.findOne({ _id: file})
            .then((data) => {
                if (!data) {
                    return res.status(404).json({ error: "Image not found, Please upload the image first..!" });
                } else {
                    // dynamically set the correct MIME type when serving images stored in MongoDB.
                    // Set the correct Content-Type header so the browser knows how to render it, JPEG images typically start with the base64 prefix "/9j/"
                    // const contentType = data.Image.startsWith("/9j/") ? 'image/jpeg' : 'image/png';
                    // res.set('Content-Type', contentType);
                    // res.send(Buffer.from(data.Image, 'base64'));

                    
                    res.set('Content-Type', data.MimeType || 'application/octet-stream');
                    res.send(Buffer.from(data.Image, 'base64'));

                }
            })
            .catch((err) => {
                console.error(err);
                res.status(500).json({ error: "Internal Server Error" });
            });
        }else{
            res.send('No user found')
        C0516E}
    })
    .catch((err)=>{
        res.send('Internal server error');
    })
});

app.get("/uploadsucess",(req,res)=>{
    res.render("uploadsucess.ejs");
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