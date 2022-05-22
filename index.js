const express = require('express')
const cors = require('cors');
const app = express()
require("dotenv").config();
const jwt = require('jsonwebtoken');
const port = process.env.PORT || 5000



app.use(cors())
app.use(express.json())


app.get('/', (req, res) => {
    res.send('Hello from national computer!')
})

app.listen(port, () => {
    console.log(`DOctor app listening on port ${port}`)
})