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
const storage = multer.memoryStorage();
const upload = multer({ storage: storage });

dotenv.config();
const port =3000;
const app=express();

app.use(cookieParser());
app.use(express.static("public"));
app.use(bodyParser.urlencoded({extended:true}));
app.set("view engine", "ejs");

app.get("/",(req,res)=>{
    res.render("load.ejs");
});

app.get("/about",(req,res)=>{
    res.render("about.ejs");
});

app.get("/contact",(req,res)=>{
    res.render("contact.ejs");
});

// IMPORTANT: Modify the /main route and /user route to fetch and pass user data
// Or ensure main.ejs handles 'user' potentially being null/undefined

// Common function to render main.ejs with user data
const renderMainPage = async (req, res, userPhoneNumber = null) => {
    let userName = "Vault Mate User";
    let recentDocuments = []; // Initialize empty array

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
        // Continue with default 'Vault Mate User' if there's a DB error
    }

    res.render("main.ejs", {
        user: { name: userName },
        recentDocuments: recentDocuments
    });
};


// Route for the main page (accessible without login for basic viewing if desired, but user data will be default)
// For a fully secure app, you might want to remove this or redirect to signin if not logged in.
app.get("/main", (req, res) => {
    renderMainPage(req, res); // Call helper function, no userPhoneNumber initially
});

// Route for logged-in user dashboard (protected by verifyToken)
app.get("/user", verifyToken, async (req, res) => {
    // req.user.user should be available here from verifyToken
    await renderMainPage(req, res, req.user.user); // Pass userPhoneNumber from token
});


app.get("/signin",(req,res)=>{
    res.render("start.ejs");
});

app.get("/signup",(req,res)=>{
    res.render("signup.ejs");
});

app.get("/logout", (req, res) => {
    res.clearCookie('authToken');
    res.redirect("/signin");
});


app.post("/signup",(req,res)=>{
    console.log(req.body);
    const userr = new User({
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
    User.findOne({_id:req.body.mobile})
    .then(detail=>{
        console.log(detail);
        if(detail==null){
            res.render("usernotfound.ejs");
        }else if(detail.Password==req.body.password){
            const token = generate_token({user:req.body.mobile},'30m');
            res.cookie('authToken', token, { httpOnly: true });
            res.redirect("/user"); // Redirect to the /user route after successful login
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


// Docs routes - (Keep them as they are, no direct user object needed for doc.ejs)
app.get("/aadhar", (req, res) => { res.render("doc.ejs", { filename: 'Aadhar' }); });
app.get("/passport",(req,res)=>{ res.render("doc.ejs", { filename: 'Passport' }); });
app.get("/pancard",(req,res)=>{ res.render("doc.ejs", { filename: 'Pancard' }); });
app.get("/drivinglicence",(req,res)=>{ res.render("doc.ejs", { filename: 'DrivingLicence' }); });
app.get("/highschoolmarsheet",(req,res)=>{ res.render("doc.ejs", { filename: 'Highschool' }); });
app.get("/inter",(req,res)=>{ res.render("doc.ejs", { filename: 'Inter' }); });
app.get("/abc",(req,res)=>{ res.render("doc.ejs", { filename: 'ABCID' }); });
app.get("/others",(req,res)=>{ res.render("doc.ejs", { filename: 'Others' }); });


// Upload routes - make sure they also get the filename
app.get("/upload", verifyToken, (req,res)=>{
    // This route needs to determine the filename for the upload.
    // For a generic /upload page, you might pass 'Others' or have a selection UI.
    res.render("upload.ejs", { filename: 'Others' });
});

// If you have specific upload links for each document type, add routes like these:
app.get("/upload/aadhar", verifyToken, (req, res) => {
    res.render("upload.ejs", { filename: 'Aadhar' });
});
// ... add similar routes for /upload/passport, /upload/pancard, etc.

app.get("/uploadsucess",(req,res)=>{
    res.render("uploadsucess.ejs");
});

app.get("/preview",(req,res)=>{
    res.render("preview.ejs");
});


app.post('/upload/:filemode',upload.single('image'),verifyToken,(req,res)=>{
    save_image_file_service(req.file,req.user.user,req.params.filemode)
    .then(()=>{
        res.redirect('/uploadsucess');
    })
    .catch(()=>{
    })
});


app.get('/image/:filemode',verifyToken,(req,res)=>{
    const user = req.user.user;
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
                    const contentType = data.Image.startsWith("/9j/") ? 'image/jpeg' : 'image/png';
                    res.set('Content-Type', contentType);
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