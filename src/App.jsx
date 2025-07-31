import { BrowserRouter as Router, Routes, Route } from 'react-router-dom'
import Home from './Home'

import './App.css'
import Mcalist from './mcalist'
import Dashboard from './Dashboard'

function App() {
  return (
    <Router>
      <Routes>
        <Route path="/" element={<Home />} />
                <Route path="/mca" element={<Mcalist />} />
                 <Route path="/Dashboard" element={<Dashboard />} />

</Routes>
    </Router>
  )
}

export default App
