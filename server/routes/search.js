const express = require("express");
const axios = require("axios");
const { parseString } = require("xml2js");
const { authRoute, verifyToken } = require("./auth");
const Item = require("../models/Item");
const dotenv = require("dotenv");
const https = require("https");
const cookieParser = require("cookie-parser");
dotenv.config();

const agent = new https.Agent({ rejectUnauthorized: false });

const searchRoute = express.Router();
searchRoute.use(cookieParser());
const cleanAbstract = (text) => {
    const cleanText = text
        .replace(/<.*?>/g, "")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&quot;/g, '"')
        .replace(/\n/g, " ")
        .trim()
        .replace(/\s+/g, " ")
        .replace(/\u00A0/g, " ")
        .replace(/[^\w\s]/g, "");
    return cleanText;
};
// Apply middleware to parse the request body as JSON
searchRoute.use(express.json());
async function processResults(results, cookie) {
    for (let i = 0; i < results.length; i++) {
        results[i].abstract = cleanAbstract(String(results[i].summary));
        results[i].summary = await axios
            .post(
                process.env.NODE_URL + "summarize",
                {
                    text: results[i].abstract,
                },
                {
                    httpsAgent: agent,
                    headers: {
                        Cookie: cookie,
                    },
                }
            )
            .then((res) => {
                return res.data.summary;
            })
            .catch((err) => console.error(err));
    }
    return results;
}
searchRoute.get("/", verifyToken, async (req, res) => {
    const { search_query, id_list, start, max_results } = req.body;

    try {
        const response = await axios.get("http://export.arxiv.org/api/query", {
            params: {
                search_query,
                id_list,
                start,
                max_results, // You can pass additional search parameters
            },
        });

        // Parse the XML response into a JavaScript object
        let results;
        parseString(response.data, (err, result) => {
            if (err) {
                throw new Error("Failed to parse XML response");
            }
            results = result.feed.entry;
        });
        results = await processResults(results, req.cookies.jwt);
        const search_history = axios.post(
            process.env.NODE_URL + "searchhistory",
            {
                search_query,
                id_list,
                start,
                max_results,
            },
            {
                httpsAgent: agent,
                headers: {
                    Cookie: req.cookies.jwt,
                },
            }
        );
        res.json(results);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: "ArXiv search failed" });
    }
});

module.exports = searchRoute;
