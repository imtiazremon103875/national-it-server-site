const express = require('express')
const cors = require('cors');
const { MongoClient, ServerApiVersion, ObjectId, Transaction } = require('mongodb');
const app = express()
require("dotenv").config();
const jwt = require('jsonwebtoken');
const port = process.env.PORT || 5000
const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY)



app.use(cors())
app.use(express.json())

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.zs9u9.mongodb.net/?retryWrites=true&w=majority`;
const client = new MongoClient(uri, { useNewUrlParser: true, useUnifiedTopology: true, serverApi: ServerApiVersion.v1 });

function verifyJWT(req, res, next) {
    const authHeader = req.headers.authorization;
    if (!authHeader) {
        return res.status(401).send({ message: "unauthorized access" })
    }
    const token = authHeader.split(' ')[1];
    jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, function (err, decoded) {
        if (err) {
            return res.status(403).send({ message: "forbidden access" })
        }
        req.decoded = decoded;
        next()
    })
}


async function run() {
    try {
        await client.connect();
        const partsCollection = client.db('national-computer').collection('parts')
        const userCollection = client.db('national-computer').collection('users')
        const orderCollection = client.db('national-computer').collection('orders')
        const reviewCollection = client.db('national-computer').collection('reviews')
        const profileCollection = client.db('national-computer').collection('profiles')
        const paymentCollection = client.db('national-computer').collection('payments')

        const verifyAdmin = async (req, res, next) => {
            const requester = req.decoded.email;
            const requesterAccount = await userCollection.findOne({ email: requester })
            if (requesterAccount.role === 'admin') {
                next()
            }
            else {
                res.status(403).send({ message: "forbidden" })
            }
        }

        app.get('/part', async (req, res) => {
            const query = {}
            const parts = await partsCollection.find(query).sort({ _id: -1 }).limit(6).toArray()
            res.send(parts)
        });

        app.get('/part/:id', verifyJWT, async (req, res) => {
            const id = req.params.id;
            const query = { _id: ObjectId(id) }
            const singlePart = await partsCollection.findOne(query)
            res.send(singlePart);
        })

        app.put('/user/:email', async (req, res) => {
            const email = req.params.email;
            const user = req.body;
            const filter = { email: email };
            const options = { upsert: true };
            const updateDoc = {
                $set: user,
            };
            const result = await userCollection.updateOne(filter, updateDoc, options);
            const token = jwt.sign({ email: email }, process.env.ACCESS_TOKEN_SECRET, { expiresIn: '30d' })
            res.send({ result, token });
        })

        app.get('/user', verifyJWT, async (req, res) => {

            const users = await userCollection.find().toArray()
            res.send(users)
        })

        app.post('/order', async (req, res) => {
            const order = req.body;
            const result = await orderCollection.insertOne(order);
            res.send(result)
        })

        app.get('/order', verifyJWT, async (req, res) => {

            const email = req.query.email;
            const decodedEmail = req.decoded.email;
            if (email == decodedEmail) {
                const query = { email }
                const orders = await orderCollection.find(query).toArray()
                return res.send(orders)
            }
            else {
                return res.status(403).send({ message: "forbidden access" })
            }
        })
        app.delete('/userProduct/:id', verifyJWT, async (req, res) => {
            const id = req.params.id;
            const query = { _id: ObjectId(id) }
            const result = await orderCollection.deleteOne(query)
            res.send(result)
        })
        app.post('/review', verifyJWT, async (req, res) => {
            const review = req.body;
            const result = await reviewCollection.insertOne(review);
            res.send(result)
        })
        app.get('/review', async (req, res) => {
            const query = {}
            const result = await reviewCollection.find(query).sort({ _id: -1 }).toArray();
            res.send(result)
        })
        app.put('/profile/:email', async (req, res) => {
            const email = req.params.email;
            const profile = req.body;
            const filter = { email: email }
            const options = { upsert: true }
            const updateDoc = {
                $set: profile
            }
            const result = await profileCollection.updateOne(filter, updateDoc, options);
            res.send(result)
        })
        app.put('/user/admin/:email', verifyJWT, verifyAdmin, async (req, res) => {
            const email = req.params.email;
            const filter = { email: email }
            const updateDoc = {
                $set: { role: 'admin' }
            }
            const result = await userCollection.updateOne(filter, updateDoc)
            res.send(result)
        })
        app.get('/admin/:email', verifyJWT, async (req, res) => {
            const email = req.params.email;
            const user = await userCollection.findOne({ email: email });
            const isAdmin = user.role === 'admin';
            res.send({ admin: isAdmin })
        })
        app.post('/product', verifyJWT, verifyAdmin, async (req, res) => {
            const product = req.body;
            const result = await partsCollection.insertOne(product)
            res.send(result)
        })

        app.get('/products', verifyJWT, verifyAdmin, async (req, res) => {
            const products = await partsCollection.find().toArray();
            res.send(products)
        })
        app.delete('/adminProduct/:id', verifyJWT, verifyAdmin, async (req, res) => {
            const id = req.params.id;
            const query = { _id: ObjectId(id) }
            const result = await partsCollection.deleteOne(query)
            res.send(result)
        })
        app.get('/allOrders', verifyJWT, verifyAdmin, async (req, res) => {
            const allOrders = await orderCollection.find().toArray();
            res.send(allOrders)
        })

        app.get('/order/:id', verifyJWT, async (req, res) => {
            const id = req.params.id;
            const query = { _id: ObjectId(id) }
            const order = await orderCollection.findOne(query)
            res.send(order)
        })

        app.post('/create-payment-intent', verifyJWT, async (req, res) => {
            const { totalPrice } = req.body;
            const amount = totalPrice * 100;
            const paymentIntent = await stripe.paymentIntents.create({
                amount: amount,
                currency: 'usd',
                payment_method_types: ['card']
            })
            res.send({ clientSecret: paymentIntent.client_secret })
        })

        app.patch('/order/:id', verifyJWT, async (req, res) => {
            const id = req.params.id
            const payment = req.body
            const filter = { _id: ObjectId(id) }
            const updateDoc = {
                $set: {
                    paid: true,
                    transectionId: payment.transectionId
                }
            }

            const result = await paymentCollection.insertOne(payment)
            const updatedOrder = await orderCollection.updateOne(filter, updateDoc)
            res.send(updateDoc)

        })

    }
    finally {

    }
}

run().catch(console.dir)
app.get('/', (req, res) => {
    res.send('Hello from national computer!')
})

app.listen(port, () => {
    console.log(`national app listening on port ${port}`)
})