import express from "express";
import bodyParser from "body-parser";
import os from "os";
import dotenv from "dotenv";
import cookieParser from "cookie-parser";
import User from "./models/user_model.js"; // Make sure this path is correct
import Images from "./models/image_model.js";
import save_image_file_service from "./services/save_image_file_service.js";
import generate_token from "./utils/generate_token.js";
import verifyToken from "./middlewares/verifyToken.js"; // Your custom middleware
import multer from "multer";
import nodemailer from "nodemailer";
import session from "express-session";
import bcrypt from "bcrypt";

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

dotenv.config();
const port = 3000;
const app = express();

app.use(cookieParser());
app.use(express.static("public"));
app.use(bodyParser.urlencoded({ extended: true }));
app.set("view engine", "ejs");

const storage = multer.memoryStorage();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB max
});

const transporter = nodemailer.createTransport({
  host: "smtp.gmail.com",
  port: 465,
  secure: true, 
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS // App password, not your Gmail password
  }
});


app.use(
  session({
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: true,
    cookie: { maxAge: 30 * 60 * 1000 }, // 30 minutes
  })
);


// function to render main.ejs with user data
const renderMainPage = async (req, res, userPhoneNumber = null) => {
  let userName = "Vault Mate User";
  let recentDocuments = [];
  try {
    let foundUser = null;
    if (userPhoneNumber) {
      foundUser = await User.findOne({ _id: userPhoneNumber });
    } else if (req.user && req.user.user) {
      // Check if verifyToken populated req.user
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
    recentDocuments: recentDocuments,
  });
};

// Get routes
app.get("/", (req, res) => {
  const token = req.cookies.authToken;
  if (token) {
    return res.redirect("/main");
  }
  res.render("load.ejs");
});

// Route for logged-in user dashboard (protected by verifyToken)
app.get("/main", verifyToken, async (req, res) => {
  await renderMainPage(req, res, req.user.user); // Pass userPhoneNumber from token
});

app.get("/signin", (req, res) => {
  res.render("start.ejs");
});

app.get("/signup", (req, res) => {
  res.render("signup.ejs");
});

app.get("/about", (req, res) => {
  res.render("about.ejs");
});

app.get("/contact", (req, res) => {
  res.render("contact.ejs");
});

app.get("/logout", (req, res) => {
  res.clearCookie("authToken");
  res.redirect("/signin");
});

app.get("/forgot-password", (req, res) => {
  res.render("forgotpassword.ejs");
});

app.post("/signin", async (req, res) => {
  const { mobile, password } = req.body;
  const user = await User.findOne({ _id: mobile });

  if (!user) {
    return res.render("usernotfound.ejs");
  }

  const isMatch = await bcrypt.compare(password, user.Password);
  if (!isMatch) {
    return res.render("wrongpassword.ejs");
  }

  //  Generate OTP
  const otp = Math.floor(100000 + Math.random() * 900000);
  req.session.otp = otp;
  req.session.otpExpires = Date.now() + 5 * 60 * 1000;
  req.session.pendingUser = mobile;

  //  Send OTP via email
  await transporter.sendMail({
    from: process.env.EMAIL_USER,
    to: user.Email,
    subject: "Vault Mate Login OTP",
    text: `Your OTP is ${otp}. It expires in 5 minutes.`,
  });

  res.render("verifyotp.ejs", { email: user.Email });
});

app.post("/signup", async (req, res) => {
  console.log(req.body);

  const isValidPhone = /^[6-9]\d{9}$/.test(req.body.phoneNumber);
  if (!isValidPhone) {
    return res.status(400).send("Invalid phone number format");
  }
  const isValidEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(req.body.email);
  if (!isValidEmail) {
    return res.status(400).send("Invalid email format");
  }

  const existingUser = await User.findOne({ _id: req.body.phoneNumber });
  if (existingUser) {
    return res.render("useralreadyexits.ejs");
  }

  const newUser = new User({
    _id: req.body.phoneNumber,
    Email: req.body.email,
    Name: req.body.firstName + " " + req.body.lastName,
    Password: await bcrypt.hash(req.body.password, 10),
  });

  try {
    await newUser.save();
    console.log("New user saved!");

    //  Generate OTP
    const otp = Math.floor(100000 + Math.random() * 900000);
    req.session.otp = otp;
    req.session.otpExpires = Date.now() + 5 * 60 * 1000;
    req.session.pendingUser = req.body.phoneNumber;

    // Send OTP via email
    await transporter.sendMail({
      from: process.env.EMAIL_USER,
      to: req.body.email,
      subject: "Vault Mate Signup OTP",
      text: `Welcome to Vault Mate!\nYour OTP is ${otp}. It expires in 5 minutes.`,
    });

    res.render("verifyotp.ejs", { email: req.body.email });
  } catch (err) {
    console.log("Signup error:", err);
    res.status(500).send("Internal Server Error");
  }
});

app.post("/verify-otp", (req, res) => {
  const { enteredOtp } = req.body;

  if (
    req.session.otp &&
    Date.now() < req.session.otpExpires &&
    enteredOtp == req.session.otp
  ) {
    const token = generate_token({ user: req.session.pendingUser }, "30m");
    res.cookie("authToken", token, { httpOnly: true });

    //  Clear session
    req.session.otp = null;
    req.session.otpExpires = null;
    req.session.pendingUser = null;

    res.redirect("/main");
  } else {
    res.render("otpfailed.ejs");
  }
});

// Reset Password routes
app.post("/reset-password", async (req, res) => {
  const { newPassword } = req.body;
  const hashedPassword = await bcrypt.hash(newPassword, 10);

  await User.updateOne(
    { _id: req.session.resetUser },
    { $set: { Password: hashedPassword } }
  );

  req.session.otp = null;
  req.session.otpExpires = null;
  req.session.resetUser = null;

  res.redirect("/signin");
});

app.post("/verify-reset-otp", (req, res) => {
  const { enteredOtp } = req.body;

  if (
    req.session.otp &&
    Date.now() < req.session.otpExpires &&
    enteredOtp == req.session.otp
  ) {
    res.render("resetpassword.ejs");
  } else {
    res.render("otpfailed.ejs");
  }
});

app.post("/forgot-password", async (req, res) => {
  const { email } = req.body;
  const user = await User.findOne({ Email: email });

  if (!user) {
    return res.render("usernotfound.ejs");
  }

  const otp = Math.floor(100000 + Math.random() * 900000);
  req.session.otp = otp;
  req.session.otpExpires = Date.now() + 5 * 60 * 1000;
  req.session.resetUser = user._id;

  await transporter.sendMail({
    from: process.env.EMAIL_USER,
    to: email,
    subject: "Vault Mate Password Reset OTP",
    text: `Your OTP is ${otp}. It expires in 5 minutes.`,
  });

  res.render("verifyresetotp.ejs", { email });
});

// Docs route
app.get("/doc/:type", verifyToken, async (req, res) => {
  const userId = req.user.user;
  const rawType = req.params.type;
  const normalizedType =
    rawType.charAt(0).toUpperCase() + rawType.slice(1).toLowerCase();

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
      mimeType: mimeType || "unknown",
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
app.post(
  "/upload/:filemode",
  upload.single("image"),
  verifyToken,
  (req, res) => {
    // save_image_file_service(file, userID ,feilds)
    save_image_file_service(req.file, req.user.user, req.params.filemode)
      .then(() => {
        res.redirect("/uploadsucess");
      })
      .catch(() => {});
  }
);

app.get("/image/:filemode", verifyToken, (req, res) => {
  const user = req.user.user;
  console.log("Image request for user:", user);
  const filename = req.params.filemode;
  User.findOne({ _id: user })
    .then((response) => {
      if (response) {
        console.log("document requested by" + user);
        const file = response[filename];
        Images.findOne({ _id: file })
          .then((data) => {
            if (!data) {
              return res.status(404).json({
                error: "Document not found, Please upload the document first..!",
              });
            } else {
              // dynamically set the correct MIME type when serving images stored in MongoDB.
              // Set the correct Content-Type header so the browser knows how to render it, JPEG images typically start with the base64 prefix "/9j/"
              // const contentType = data.Image.startsWith("/9j/") ? 'image/jpeg' : 'image/png';
              // res.set('Content-Type', contentType);
              // res.send(Buffer.from(data.Image, 'base64'));

              res.set(
                "Content-Type",
                data.MimeType || "application/octet-stream"
              );
              res.send(Buffer.from(data.Image, "base64"));
            }
          })
          .catch((err) => {
            console.error(err);
            res.status(500).json({ error: "Internal Server Error" });
          });
      } else {
        res.send("No user found");
        C0516E;
      }
    })
    .catch((err) => {
      res.send("Internal server error");
    });
});

app.get("/uploadsucess", (req, res) => {
  res.render("uploadsucess.ejs");
});

let localAddress = "localhost";

const interfaces = os.networkInterfaces();
Object.keys(interfaces).forEach((interfaceName) => {
  interfaces[interfaceName].forEach((iface) => {
    if (iface.family === "IPv4" && !iface.internal) {
      localAddress = iface.address;
    }
  });
});

app.listen(port, "0.0.0.0", () => {
  console.log(`Server is running on port ${port}`);
  console.log(`Server is also accessible at http://${localAddress}:${port}`);
});
