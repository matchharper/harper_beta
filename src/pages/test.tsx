import React, { useState } from 'react'

const Test = () => {
    const [query, setQuery] = useState('잡코리아');
    const [results, setResults] = useState([]);

    const getSearchResults = async () => {
        const res = await fetch('/api/tool/scrape', {
            method: 'POST',
            body: JSON.stringify({ url: "https://wjuni.com/" }),
        });
        const data = await res.json();
        console.log(data);
        localStorage.setItem('searchResults', JSON.stringify(data));
        setResults(data);
    }

    return (
        <div className="flex flex-col items-center justify-center h-screen w-screen text-white font-sans">
            Test
            <div className="mt-24">get search results</div>
            <div className="mt-24">
                <input className="text-black bg-white" type="text" onChange={(e) => setQuery(e.target.value)} value={query} />
                <button onClick={() => getSearchResults()} className="p-4 rounded-sm hover:bg-gray-100">Get Search Results</button>
            </div>
        </div>
    )
}

export default Test