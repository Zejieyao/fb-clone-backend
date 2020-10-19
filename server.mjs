import express from 'express'
import mongoose from 'mongoose'
import cors from 'cors'
import multer from 'multer'
import GridFsStorage from 'multer-gridfs-storage'
import Grid from 'gridfs-stream'
import bodyParser from 'body-parser'
import path from 'path'
import Pusher from 'pusher' //pusher make the mongoDB real-time, push data in mongodb to front-end
import mongoPosts from './mongoPosts.mjs'

//app config
Grid.mongo = mongoose.mongo;
const app = express();
const port = process.env.PORT || 8080;

var pusher = new Pusher({
    appId: '1092649',
    key: '741e714a0f6a8c881e30',
    secret: '7635b01e0c0e8278d7af',
    cluster: 'us2',
    encrypted: true
  });

//middlewares
app.use(bodyParser.json());
app.use(cors());

//db config
const mongoURI = 'mongodb://admin:123123123@cluster0-shard-00-00.evkye.mongodb.net:27017,cluster0-shard-00-01.evkye.mongodb.net:27017,cluster0-shard-00-02.evkye.mongodb.net:27017/fb-backendDB?ssl=true&replicaSet=atlas-ig0xjg-shard-0&authSource=admin&retryWrites=true&w=majority'

const conn = mongoose.createConnection(mongoURI, {
    useCreateIndex: true,
    useNewUrlParser: true,
    useUnifiedTopology: true,
})

mongoose.connect(mongoURI, {
    useCreateIndex: true,
    useNewUrlParser: true,
    useUnifiedTopology: true,
})

mongoose.connection.once('open', () => {
    console.log('DB connected')
    const changeStream = mongoose.connection.collection('posts').watch()
    changeStream.on('change', (change) => {
        console.log(change)
        if (change.operationType === 'insert') {
            pusher.trigger('posts', 'inserted', {
                change : change
            })
        } else {
            console.log('error triggering pusher')
        }
    })
})

let gfs;

conn.once('open', () => {
    console.log('DB connected')
    
    gfs = Grid(conn.db, mongoose.mongo)
    gfs.collection('images')
})

//define how to store a image as a file in mongoDB and the name of file
const storage = new GridFsStorage({
    url: mongoURI,
    file: (req, file) => {
        return new Promise((resolve, reject) => {{
            const filename = `image-${Date.now()}${path.extname(file.originalname)}`

            const fileInfo = {
                filename: filename,
                bucketname: 'images'
            }
            resolve(fileInfo)
        }})
    }
})

const upload = multer({ storage })

//api routes
app.get('/', (req, res) => res.status(200).send('hello'))
//  upload image to database
app.post('/upload/image', upload.single('file'), (req, res) => {
    res.status(201).send(req.file)
})
//  upload post to database
app.post('/upload/post', (req, res) => {
    const dbPost = req.body;

    mongoPosts.create(dbPost, (err, data) => {
        if(err) {
            res.status(500).send(err)
        } else {
            res.status(201).send(data)
        }
    })
})
//  find image in database
app.get('/find/image/single', (req, res) => {
    gfs.files.findOne({filename: req.query.name}, (err, file) => {
        if (err) {
            res.status(500).send(err)
        } else {
            if(!file || file.length === 0) {
                res.status(404).json({ err : 'file not found' })
            } else {
                const readstream = gfs.createReadStream(file.filename);
                readstream.pipe(res);
            }
        }
    })
})

//  find post in database
app.get('/find/posts', (req, res) => {
    mongoPosts.find((err, data) => {
        if (err) {
            res.status(500).send(err)
        } else {
            data.sort((b, a) => {
                return a.timestamp - b.timestamp
            })
            res.status(201).send(data)
        }
    })
})

//listen
app.listen(port, () => console.log(`listening on port: ${port}`))