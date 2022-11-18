const express=require('express');
const cors=require('cors');
const { MongoClient, ServerApiVersion } = require('mongodb');
const { response } = require('express');
const port=process.env.PORT || 5000
require('dotenv').config()

const app=express();

app.use(cors())
app.use(express.json());




const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASSWORD}@cluster0.nuouh7o.mongodb.net/?retryWrites=true&w=majority`;
const client = new MongoClient(uri, { useNewUrlParser: true, useUnifiedTopology: true, serverApi: ServerApiVersion.v1 });
async function run(){
try{
const appoinmentOptionCollection=client.db('doctorsPortal').collection('appoinmentOption');

app.get('/appoinmentoption', async(req, res)=>{
    const query={};
    const options= appoinmentOptionCollection.find(query)
    const result= await options.toArray()
    res.send(result)
})
}
finally{

}
}
run().catch(error=>console.error(error))


app.get('/', async(req, res)=>{
    res.send('doctors portal server is running')
})

app.listen(port, ()=>{
    console.log(`doctors portal server is running on port ${port}`)
})