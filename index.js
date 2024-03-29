const express = require('express');
const jwt = require('jsonwebtoken')
const cors = require('cors');
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const { response } = require('express');
const port = process.env.PORT || 5000
require('dotenv').config()
const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);

const app = express();

app.use(cors())
app.use(express.json());




const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASSWORD}@cluster0.nuouh7o.mongodb.net/?retryWrites=true&w=majority`;
const client = new MongoClient(uri, { useNewUrlParser: true, useUnifiedTopology: true, serverApi: ServerApiVersion.v1 });
function verifyJWT(req, res, next) {
    const authHeaders = req.headers.authorization;
    // console.log(authHeaders)
    if (!authHeaders) {
        return res.status(401).send({ message: 'unauthorized access' });
    }

    const token = authHeaders.split(' ')[1];
    jwt.verify(token, process.env.ACCESS_TOKEN, function (error, decoded) {
        if (error) {
            return res.status(403).send({ message: 'forbidden access' })
        }
        req.decoded = decoded;
        next()
    })
}

async function run() {

    try {
        const appoinmentOptionCollection = client.db('doctorsPortal').collection('appoinmentOption');
        const bookingsCollection = client.db('doctorsPortal').collection('bookings');
        const usersCollection = client.db('doctorsPortal').collection('users');
        const doctorsCollection = client.db('doctorsPortal').collection('doctors');
        const paymentsCollection = client.db('doctorsPortal').collection('payments');

        const verifyAdmin = async (req, res, next) => {
            const decodedEmail = req.decoded.email;
            const query = { email: decodedEmail };
            const user = await usersCollection.findOne(query);
            if (user.role !== 'admin') {
                return res.status(403).send({ message: 'Forbidden Access' })
            }
            next()
        }


        // payment 


        app.post('/create-payment-intent', async (req, res) => {
            const booking = req.body;
            const price = booking.price;
            const amount = price * 100;

            const paymentIntent = await stripe.paymentIntents.create({
                currency: 'usd',
                amount: amount,
                "payment_method_types": [
                    "card"
                ]
            });
            res.send({
                clientSecret: paymentIntent.client_secret,
            });
        });

        app.post('/payments', async (req, res) =>{
            const payment = req.body;
            const result = await paymentsCollection.insertOne(payment);
            const id = payment.bookingId
            const filter = {_id: new ObjectId(id)}
            const updatedDoc = {
                $set: {
                    paid: true,
                    transactionId: payment.transactionId
                }
            }
            const updatedResult = await bookingsCollection.updateOne(filter, updatedDoc)
            res.send(result);
        })

        app.get('/appoinmentoption', async (req, res) => {
            const query = {};
            const date = req.query.date
            // console.log(date)
            const options = await appoinmentOptionCollection.find(query).toArray();
            const bookingQuery = { selectedDate: date }
            const alreadyBooked = await bookingsCollection.find(bookingQuery).toArray();
            // console.log(alreadyBooked);
            options.forEach(option => {
                const optionBooked = alreadyBooked.filter(book => book.treatment === option.name);
                // console.log(optionBooked)
                const bookingSlots = optionBooked.map(book => book.slot);
                // console.log(bookingSlots);
                const remainingSlots = option.slots.filter(slot => !bookingSlots.includes(slot))
                // console.log(remainingSlots)
                option.slots = remainingSlots;
            })

            res.send(options)
            // client.close()
        });

        app.get('/appoinmentspeciality', async (req, res) => {
            const query = {}
            const result = await appoinmentOptionCollection.find(query).project({ name: 1 }).toArray();
            res.send(result)
        })

        app.get('/bookings', verifyJWT, async (req, res) => {
            const email = req.query.email;
            const decodedEmail = req.decoded.email;
            if (email !== decodedEmail) {
                return res.status(403).send({ message: 'Unauthorized' })
            }
            const query = { email: email }
            const bookedData = await bookingsCollection.find(query).toArray();
            res.send(bookedData)
        });

        app.get('/bookings/:id', async(req, res)=>{
            const id= req.params.id;
            const query={_id: ObjectId(id)};
            const result=await bookingsCollection.findOne(query)
            res.send(result);
        })

        app.post('/bookings', async (req, res) => {
            const bookings = req.body
            const query = {
                selectedDate: bookings.selectedDate,
                email: bookings.email,
                treatment: bookings.treatment
            }

            const alreadyBooked = await bookingsCollection.find(query).toArray();
            if (alreadyBooked.length) {
                const message = `you have already a booking on ${bookings.selectedDate}`
                return res.send({ acknowledged: false, message })
            }
            // console.log(bookings)
            const result = await bookingsCollection.insertOne(bookings)
            res.send(result);

        });

        app.get('/jwt', async (req, res) => {
            const email = req.query.email;
            const query = { email: email }
            const user = await usersCollection.findOne(query);
            if (user) {
                const token = jwt.sign({ email }, process.env.ACCESS_TOKEN, { expiresIn: '3d' })
                return res.send({ accessToken: token });
            }
            res.status(403).send({ accessToken: '' })
        });

        app.get('/users', verifyJWT, async (req, res) => {
            const decodedEmail = req.decoded.email;
            const email = { email: decodedEmail }
            const user = await usersCollection.findOne(email)
            if (user?.role !== 'admin') {
                return res.status(403).send({ message: 'Forbidden Access' });
            }

            const query = {}
            const result = await usersCollection.find(query).toArray()
            res.send(result)
        });

        app.get('/users/admin/:email', async (req, res) => {
            const email = req.params.email;
            const query = { email: email }

            const user = await usersCollection.findOne(query);
            res.send({ isAdmin: user?.role === 'admin' });
        })

        app.post('/users', async (req, res) => {
            const user = req.body;
            const result = await usersCollection.insertOne(user);
            res.send(result)
        });

        app.patch('/users/admin/:id', verifyJWT, verifyAdmin, async (req, res) => {
            const id = req.params.id;
            const filter = { _id: ObjectId(id) }
            const options = { upsert: true, };

            const updatedDoc = {
                $set: {
                    role: 'admin'
                }
            }
            const result = await usersCollection.updateOne(filter, updatedDoc, options)
            res.send(result);
        });

       /*  app.get('/addprice', async (req, res) => {
            const filter = {};
            const option = { upsert: true }
            const updatedDoc = {
                $set: {
                    price: 99
                }
            };
            const result = await appoinmentOptionCollection.updateMany(filter, updatedDoc, option);
            res.send(result)
        }) */

        app.get('/doctors', verifyJWT, verifyAdmin, async (req, res) => {
            const query = {}
            const data = await doctorsCollection.find(query).toArray()
            res.send(data)
        })

        app.post('/dashboard/adddoctor', verifyJWT, verifyAdmin, async (req, res) => {
            const doctorData = req.body
            const result = await doctorsCollection.insertOne(doctorData);
            res.send(result);
        });

        app.delete('/doctors/:id', verifyJWT, verifyAdmin, async (req, res) => {
            const id = req.params.id;
            const filter = { _id: ObjectId(id) };
            const result = await doctorsCollection.deleteOne(filter);
            res.send(result);
        })

    }
    finally {

    }
}
run().catch(error => console.error(error))


app.get('/', async (req, res) => {
    res.send('doctors portal server is running')
})

app.listen(port, () => {
    console.log(`doctors portal server is running on port ${port}`)
})