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

/* MONGODB CONNECTION */

mongoose.connect("mongodb+srv://terabaapmerabaap99_db_user:Gamehub123@gamehub-cluster.nmpcia8.mongodb.net/gamehub")
.then(()=>console.log("MongoDB connected"))
.catch(err=>console.log(err));

/* SCHEMAS */

const userSchema = new mongoose.Schema({
  name:String,
  email:String,
  password:String,
  photo:String
});

const scoreSchema = new mongoose.Schema({
  user_id:String,
  game_name:String,
  score:Number
});

const User = mongoose.model("users",userSchema);
const Score = mongoose.model("scores",scoreSchema);

/* IMAGE STORAGE */

const storage = multer.diskStorage({
  destination:(req,file,cb)=>{
    cb(null,"uploads/");
  },
  filename:(req,file,cb)=>{
    cb(null,Date.now()+path.extname(file.originalname));
  }
});

const upload = multer({storage});

app.use("/uploads",express.static("uploads"));

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

app.post("/login",async(req,res)=>{

  const {email,password}=req.body;

  const user = await User.findOne({email});

  if(!user){
    return res.json({message:"Invalid email or password"});
  }

  const match = await bcrypt.compare(password,user.password);

  if(!match){
    return res.json({message:"Invalid email or password"});
  }

  res.json({
    message:"Login successful",
    user_id:user._id,
    name:user.name,
    photo:user.photo
  });

});

/* GET PROFILE */

app.get("/profile/:id",async(req,res)=>{

  const id=req.params.id;

  const user = await User.findById(id);

  if(!user){
    return res.json({message:"User not found"});
  }

  res.json({
    id:user._id,
    name:user.name,
    email:user.email,
    photo:user.photo
  });

});

/* UPLOAD PHOTO */

app.post("/upload-photo/:id",upload.single("image"),async(req,res)=>{

  const id=req.params.id;

  if(!req.file){
    return res.json({message:"No file uploaded"});
  }

  const photo=req.file.filename;

  await User.findByIdAndUpdate(id,{photo});

  res.json({
    message:"Photo updated",
    photo
  });

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

app.get("/all-users",async(req,res)=>{

  const users = await User.find();

  res.json(users);

});

/* SERVER */

app.listen(3000,"0.0.0.0",()=>{
  console.log("Server running on port 3000");
});