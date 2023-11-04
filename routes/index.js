var express = require("express");
var router = express.Router();
var multer = require("multer");
var id3 = require("node-id3");
const { Readable } = require("stream");
const crypto = require("crypto");

const mongoose = require("mongoose");
mongoose
  .connect("mongodb://0.0.0.0/spotify-n15")
  .then(() => {
    console.log("connected to DB");
  })
  .catch((err) => {
    console.log(err);
  });

const conn = mongoose.connection;
var gfsBucket, gfsBucketPoster;

conn.once("open", () => {
  gfsBucket = new mongoose.mongo.GridFSBucket(conn.db, {
    bucketName: "audio",
  });
  gfsBucketPoster = new mongoose.mongo.GridFSBucket(conn.db, {
    bucketName: "poster",
  });
});

// ======================(localStrategy)=================================

var users = require("../models/userModel");
var passport = require("passport");
var localStrategy = require("passport-local");
var songModel = require("../models/songModel");
var playlistModel = require("../models/playlistModel");
const userModel = require("../models/userModel");
passport.use(new localStrategy(users.authenticate()));

// =========================================================================================

/* GET home page. */

//================= user authentication routes ===============================================

router.post("/register", async function (req, res, next) {
  var newUser = new users({
    username: req.body.username,
    email: req.body.email,
  });
  users
    .register(newUser, req.body.password)
    .then(function (u) {
      passport.authenticate("local")(req, res, async () => {
        const songs = await songModel.find();
        // after the user is created we will assign a new playlist to user //
        const defaultPlaylist = await playlistModel.create({
          name: req.body.username,
          owner: req.user._id,
          songs: songs.map((song) => song._id),
        });
        console.log(songs.map((song) => song._id));

        console.log(req.body);

        //  const newUser= users.findOne({
        //   _id: req.user._id
        //  })

        newUser.playlist.push(defaultPlaylist._id);
        await newUser.save();

        console.log(req.user);

        // JSON.stringify(currentUser) is use to show all the model connected with populated in object
        //  console.log(JSON.stringify(currentUser))

        res.redirect("/");
      });
    })
    .catch(function (e) {
      res.send(e);
    });
});

router.get("/auth", (req, res, next) => {
  res.render("register");
});

router.post(
  "/login",
  passport.authenticate("local", {
    successRedirect: "/",
    failureRedirect: "/login",
  }),
  function (req, res, next) {}
);

router.get("/logout", function (req, res, next) {
  if (req.isAuthenticated())
    req.logout((err) => {
      if (err) res.send(err);
      else res.redirect("/");
    });
  else {
    res.redirect("/");
  }
});

function isLoggedIn(req, res, next) {
  // next represent this next function which is written is bracket ====

  if (req.isAuthenticated()) {
    return next();
  } else {
    res.redirect("/auth");
  }
}

function isAdmin(req, res, next) {
  if (req.user.isAdmin) return next();
  else return res.redirect("/");
}

// ========================================================================

//===========(id3.read(filename)) ->this is use to read buffer data from the file ======================

router.get("/", isLoggedIn, async function (req, res, next) {
  const currentUser = await users
    .findOne({
      _id: req.user._id,
    })
    .populate("playlist")
    .populate({
      // 1st populate is for populating user playlist and 2nd populate is for populating the songs on the basis of song model in document form  which is in playlist.
      path: "playlist",
      populate: {
        path: "songs",
        model: "song",
      },
    });
  //  console.log("the logged in user ----"+currentUser.playlist[0].songs[0].likes.length);
  //  console.log("the logged in user ----"+currentUser.playlist[0].songs);
  res.render("index", { currentUser });
});

// from this we can show poster
router.get("/poster/:posterName", (req, res, next) => {
  gfsBucketPoster.openDownloadStreamByName(req.params.posterName).pipe(res);
});

const storage = multer.memoryStorage();
const upload = multer({ storage: storage });

router.post(
  "/uploadMusic",
  isLoggedIn,
  isAdmin,
  upload.array("song"),
  async (req, res, next) => {
    // ====(req.files is used to hold or upload multiples files or folder  like uploading multiple songs in one instance )============

    //  console.log(req.files);

    //promise.all takes async fucntion and async function is time independent function and is completed by their own time

    // to learn (promise.all,map function,async await)-----------------

    await Promise.all(
      req.files.map(async (file) => {
        const randomName = crypto.randomBytes(20).toString("hex");

        // console.log(req.file);
        const songData = id3.read(file.buffer); // file is the file name near async beside map
        console.log(songData);
        Readable.from(file.buffer).pipe(gfsBucket.openUploadStream(randomName)); // file is the file name near async beside map
        Readable.from(songData.image.imageBuffer).pipe(
          gfsBucketPoster.openUploadStream(randomName + "poster")
        );
        await songModel.create({
          title: songData.title,
          artist: songData.artist,
          album: songData.album,
          size: file.size, // file is the file name near async beside map
          poster: randomName + "poster",
          fileName: randomName,
        });
      })
    );
    // do from here 3333 34:00 se chalu krna hai=======

    res.send("songs upload");
  }
);

router.get("/uploadMusic", isLoggedIn, isAdmin, (req, res, next) => {
  //========= (passport gives a another function called req.user which is use to take out the data of user)=======================

  // console.log(req.user.isAdmin);
  res.render("uploadMusic");
});

router.get("/stream/:musicName", async (req, res, next) => {
  const currentSong = await songModel.findOne({
    fileName: req.params.musicName,
  });
  console.log("to stream " + currentSong);
  const stream = gfsBucket.openDownloadStreamByName(req.params.musicName);

  // this below 5 line is for making controls in the music bar and to see the length

  res.set("Content-Type", "audio/mpeg"); //audio type mpeg hai
  res.set("Content-Length", currentSong.size + 1); // size of song with one empty byte (+1)
  res.set(
    "Content-Range",
    `bytes 0-${currentSong.size - 1}/${currentSong.size}`
  ); // this line shows how much big song we are sending
  res.set("Content-Ranges", "byte"); // which type of data we are using (bit,bytes,megabytes etc..)
  res.status(206); // this means we had send u a part only

  stream.pipe(res);
  //  res.render("index",{currentSong})
});

router.get("/search", (req, res, next) => {
  res.render("search");
});

router.post("/search", async (req, res, next) => {
  const searchedMusic = await songModel.find({
    //$regex means we dont need to type whole name to seach a music or item
    title: { $regex: req.body.search },
  });
  // console.log("ancnacm-----" + searchedMusic);
  res.json({
    songs: searchedMusic,
  });
});

router.get("/like/:id", async (req, res, next) => {
  try {
    const songId = req.params.id;
    const user = await userModel.findOne({
      username: req.session.passport.user,
    });

    // Check if the user has already liked this song
    const song = await songModel.findById(songId);
    if (!song) {
      return res.status(404).send("Song not found");
    }

    // Check if the user has liked this song
    const userLiked = song.likes.some((userId) => userId.equals(user._id));

    if (userLiked) {
      // User has already liked the song, so unlike it
      song.likes.pop(user._id);
      user.liked.pop(songId);
      req.session.userLiked = false; // Set session variable to false
    } else {
      // User hasn't liked the song, so like it
      song.likes.push(user._id);
      user.liked.push(songId);
      req.session.userLiked = true; // Set session variable to true
    }

    // Save the changes to the database
    await song.save();
    await user.save();

    // Redirect back to the previous page and pass the userLiked session variable
    res.redirect("/");
  } catch (error) {
    console.error(error);
    res.status(500).send("Internal Server Error");
  }
});

router.post("/createplaylist", async (req, res, next) => {
  let user = await userModel.findOne({ username: req.session.passport.user });
  let newplay = await playlistModel
    .create({
      name: req.body.name,
      owner: user._id,
      songs: [],
    })
    .then(function (createdp) {
      user.playlist.push(createdp._id);
      user.save();
      res.redirect("/");
      // res.send(`name--${req.body.name} == owner --${user._id}== username: ${user}------rrrr${createdp}  `)
    });
});

router.get("/addsong/:id", async (req, res, next) => {
  let currentUser = await userModel.findOne({
    username: req.session.passport.user,
  });
  let allSongs = await songModel.find();
  let currplaylist = await playlistModel
    .findById(req.params.id)
    .populate("songs");
  //  let currplaylist= req.params.id;
  //  currplaylist.populate('songs');
  console.log(allSongs);
  //  console.log(` this is current playlist---+${currplaylist} and the  current user is --${currentUser}`);
  res.render("playlist", { allSongs, currplaylist, currentUser });
  // res.send(allSongs);
});

// Handle the delete playlist request
router.get("/deleteplaylist/:playlistId", async (req, res) => {
  let person = await userModel.findOne({ username: req.session.passport.user });
  const playlistId = req.params.playlistId;
  console.log(playlistId);
  const index = 1;

  // Before the splice operation
  console.log("Index to remove:", index);
  console.log("Playlist to remove:", person.playlist[index]);

  if (index) {
    // Remove the playlist from the array using splice
    person.playlist.splice(index, 1);
    console.log("Playlist removed");
    await person.save();
    console.log("User saved with updated playlist:", person.playlist);

    // You should also save the changes to your data store here.

    // Redirect the user to the page displaying the updated playlists
    res.redirect("back"); // Change '/playlists' to your actual playlist page URL
  } else {
    // Handle the case where the playlist with the given _id was not found
    res.status(404).send("Playlist not found");
  }
});

router.get("/insertsong/:playlistId/:songId", async (req, res, next) => {
  let user = await userModel.findOne({ username: req.session.passport.user });
  let playlist = await playlistModel.findOne({ _id: req.params.playlistId });
  let song = await songModel.findOne({ _id: req.params.songId });

  playlist.songs.push(song._id);
  playlist.save();

  // res.send(`user is ${user} and playlist is ${playlist} and song is ${song}`);
  res.redirect("back");
});

router.get("/openplaylist/:listId", async (req, res, next) => {
  // currentUser
  //currentPlaylist
  let currentUser = await userModel.findOne({
    username: req.session.passport.user,
  });
  let currplaylist = await playlistModel
    .findOne({ _id: req.params.listId })
    .populate("songs");

  // res.send(`current user is ${currentUser} and the playlist is ${currentPlaylist}`)
  res.render("playlistopen", { currentUser, currplaylist });
});

router.get("/song/:songId", async (req, res, next) => {
  res.redirect("/");
});

module.exports = router;
