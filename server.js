require('dotenv').config();
const express = require("express");
const bodyParser = require("body-parser");
const cors = require("cors");
const bcrypt = require("bcrypt");
const multer = require("multer");
const path = require("path");
const mongoose = require("mongoose");
const app = express();

app.use(bodyParser.json());
app.use(cors());

console.log("CONNECTED DB:", mongoose.connection.host);
console.log("Cloud Name:", process.env.CLOUDINARY_CLOUD_NAME);
console.log("MONGO URI:", process.env.MONGO_URI);

const cloudinary = require('cloudinary').v2;

if (!process.env.CLOUDINARY_CLOUD_NAME) {
  console.log("❌ Cloudinary ENV missing");
}

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});



/* MONGODB CONNECTION */
console.log("MONGO_URI:", process.env.MONGO_URI);
mongoose.connect(process.env.MONGO_URI)
.then(()=>console.log("MongoDB connected"))
.catch(err=>console.log(err));

/* SCHEMAS */

const userSchema = new mongoose.Schema({
  name: { type:String, unique:true },
  email: { type:String, unique:true },
  password: String,
  photo: String,

  isAdmin: {
    type: Boolean,
    default: false
  }
});


const scoreSchema = new mongoose.Schema({
  user_id:String,
  game_name:String,
  score:Number
},{
  timestamps:true
});

const User = mongoose.model("users",userSchema);
const Score = mongoose.model("scores",scoreSchema);

/* IMAGE STORAGE */


const storage = multer.memoryStorage();
const upload = multer({ storage });

/* REGISTER */

app.post("/register",async(req,res)=>{

  const {name,email,password}=req.body;

  const emailExists = await User.findOne({email});

  if(emailExists){
    return res.json({message:"Email already registered"});
  }

  const nameExists = await User.findOne({name});

  if(nameExists){
    return res.json({
      message:"Username already exists. Choose different name"
    });
  }

  const hash = await bcrypt.hash(password,10);

  const user = new User({
    name,
    email,
    password:hash
  });

  await user.save();

  res.json({
    message:"Registration successful",
    user_id:user._id
  });

});

/* LOGIN */

app.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;

    console.log("LOGIN BODY:", req.body); 

    const user = await User.findOne({ email });

    if (!user) {
      return res.json({ message: "Invalid email or password" });
    }

    const match = await bcrypt.compare(password, user.password);

    if (!match) {
      return res.json({ message: "Invalid email or password" });
    }

    res.json({
      message: "Login successful",
      user_id: user._id,
      name: user.name,
      photo: user.photo,
      isAdmin: user.isAdmin
    });

  } catch (err) {
    console.log("LOGIN ERROR:", err);
    res.status(500).json({ error: err.message });
  }
});

/* GET PROFILE */

app.get("/profile/:id",async(req,res)=>{

  const id=req.params.id;

  const user = await User.findById(id);
  if(!user){
    return res.status(404).json({message:"User not found"});
  }
 

  res.json({
    id:user._id,
    name:user.name,
    email:user.email,
    photo:user.photo
  });

});

/* UPLOAD PHOTO */

app.post("/upload-photo/:id", upload.single("image"), async (req, res) => {
  try {
    const id = req.params.id;

    if (!req.file) {
      return res.json({ message: "No file uploaded" });
    }

    const stream = cloudinary.uploader.upload_stream(
      { folder: "profile_photos" },
      async (error, result) => {
        if (error) {
          return res.status(500).json({ message: error.message });
        }

        const photo = result.secure_url;

        await User.findByIdAndUpdate(id, { photo });

        res.json({
          message: "Photo updated",
          photo
        });
      }
    );

    stream.end(req.file.buffer);

  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

/* CHANGE PASSWORD */

app.post("/change-password/:id",async(req,res)=>{

  const id=req.params.id;
  const {old_password,new_password}=req.body;

  const user = await User.findById(id);

  if(!user){
    return res.json({message:"User not found"});
  }

  const match = await bcrypt.compare(old_password,user.password);

  if(!match){
    return res.json({message:"Old password incorrect"});
  }

  const hash = await bcrypt.hash(new_password,10);

  await User.findByIdAndUpdate(id,{password:hash});

  res.json({message:"Password changed successfully"});

});

/* GAME ANALYTICS  */
app.get("/analytics", async (req, res) => {
  try {

    const totalUsers = await User.countDocuments();
    const totalGamesPlayed = await Score.countDocuments();

    const gameStats = await Score.aggregate([
      {
        $group: {
          _id: "$game_name",
          totalPlays: { $sum: 1 }
        }
      },
      {
        $sort: { totalPlays: -1 }
      }
    ]);

    /// 🔥 CLEAN FORMAT (ARRAY instead of MAP)
    const games = gameStats.map(g => ({
      name: g._id,
      plays: Number(g.totalPlays) // ✅ force number
    }));

    res.json({
      totalUsers: Number(totalUsers),          // ✅ ensure int
      totalGamesPlayed: Number(totalGamesPlayed), // ✅ ensure int
      games: games                             // ✅ array
    });

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/* SAVE USER DETAILS */
app.get("/user-details/:id", async (req, res) => {
  try {
    const userId = req.params.id;

    const user = await User.findById(userId).select("name email photo");

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    const scores = await Score.find({ user_id: userId });

    // convert array → object
    const scoreMap = {};

    scores.forEach(s => {
      scoreMap[s.game_name] = s.score;
    });

    res.json({
      user,
      scores: scoreMap
    });

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});


/* SAVE SCORE */

app.post("/save-score",async(req,res)=>{

  const {user_id,game_name,score}=req.body;

  const existing = await Score.findOne({
    user_id,
    game_name
  });

  if(!existing){

    const newScore = new Score({
      user_id,
      game_name,
      score
    });

    await newScore.save();

    return res.json({message:"Score saved"});
  }

  if(score > existing.score){

    existing.score = score;

    await existing.save();

    return res.json({
      message:"New high score updated"
    });
  }

  res.json({
    message:"Score not higher than previous"
  });

});

/* LEADERBOARD */

app.get("/leaderboard/:game",async(req,res)=>{

  const game=req.params.game;

  const users = await User.find();

  const leaderboard=[];

  for(let u of users){

    const s = await Score.findOne({
      user_id:u._id,
      game_name:game
    });

    leaderboard.push({
      name:u.name,
      photo:u.photo,
      score:s ? s.score : 0
    });
  }

  leaderboard.sort((a,b)=>b.score-a.score);

  const ranked = leaderboard.map((p,i)=>({
    rank:i+1,
    name:p.name,
    score:p.score,
    photo:p.photo
  }));

  res.json(ranked);

});

/* USER BEST SCORE */

app.get("/my-score/:user/:game",async(req,res)=>{

  const {user,game}=req.params;

  const s = await Score.findOne({
    user_id:user,
    game_name:game
  });

  if(!s){
    return res.json({best_score:0});
  }

  res.json({best_score:s.score});

});

/* GET ALL USERS */
app.get("/all-users/:adminId",async(req,res)=>{

  try{

    const admin = await User.findById(req.params.adminId);

    if(!admin || !admin.isAdmin){
      return res.status(403).json({message:"Not authorized"});
    }

    const users = await User.find().select("name email photo");

    res.json(users);

  }catch(e){
    res.status(500).json({message:e.message});
  }

});

/* Delete USERS */

app.delete("/delete-user/:adminId/:userId",async(req,res)=>{

  try{

    const {adminId,userId} = req.params;

    const admin = await User.findById(adminId);

    if(!admin || !admin.isAdmin){
      return res.status(403).json({message:"Not authorized"});
    }

    if(adminId === userId){
      return res.json({message:"Admin cannot delete itself"});
    }

    await User.findByIdAndDelete(userId);

    /// score bhi delete kar de
    await Score.deleteMany({user_id:userId});

    res.json({message:"User deleted successfully"});

  }catch(e){
    res.status(500).json({message:e.message});
  }

});


/* SERVER */
const PORT = process.env.PORT || 3000;

app.listen(PORT,"0.0.0.0",()=>{
  console.log(`Server running on port ${PORT}`);
});