import React, { useState, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { FaChartBar, FaHome, FaFileAlt, FaCog, FaSignOutAlt, FaBars } from "react-icons/fa";
import Chart from "chart.js/auto";
import { io } from "socket.io-client";

// Initialize Socket.IO client
const socket = io("http://localhost:3002");

const Dashboard = () => {
  const [emailUser, setEmailUser] = useState("User");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [companies, setCompanies] = useState([]);
  const navigate = useNavigate();

  // Fetch email user
  useEffect(() => {
    const fetchEmailUser = async () => {
      try {
        const response = await fetch("http://localhost:3002/api/get-email-user");
        if (!response.ok) {
          throw new Error(`Failed to fetch email user: ${response.statusText}`);
        }
        const data = await response.json();
        setEmailUser(data.emailUser || "User");
      } catch (error) {
        console.error("Error fetching email user:", error.message);
        setEmailUser("User");
      }
    };
    fetchEmailUser();
  }, []);

  // Fetch company data initially and set up Socket.IO
  useEffect(() => {
    const fetchCompanies = async () => {
      try {
        const response = await fetch("http://localhost:3002/api/companies");
        if (!response.ok) {
          throw new Error(`Failed to fetch companies: ${response.statusText}`);
        }
        const data = await response.json();
        console.log("Fetched companies for dashboard:", data); // Debug: Log fetched data
        setCompanies(data);
      } catch (error) {
        console.error("Error fetching companies:", error.message);
        setCompanies([]);
      } finally {
        setLoading(false);
      }
    };

    fetchCompanies();

    socket.on("companyUpdated", (updatedCompany) => {
      console.log("Company updated via socket:", updatedCompany);
      setCompanies((prevCompanies) => {
        const existingIndex = prevCompanies.findIndex(c => c._id === updatedCompany._id);
        if (existingIndex !== -1) {
          const updated = [...prevCompanies];
          updated[existingIndex] = updatedCompany;
          return updated;
        } else {
          return [...prevCompanies, updatedCompany];
        }
      });
    });

    socket.on("companyDeleted", (companyId) => {
      console.log("Company deleted via socket:", companyId);
      setCompanies((prevCompanies) =>
        prevCompanies.filter((company) => company._id !== companyId)
      );
    });

    return () => {
      socket.off("companyUpdated");
      socket.off("companyDeleted");
      socket.disconnect();
    };
  }, []);

  // Initialize Chart for Email Status
  useEffect(() => {
    if (loading || companies.length === 0) return;

    const emailStatusData = companies.reduce(
      (acc, company) => {
        acc[company.status] = (acc[company.status] || 0) + 1;
        return acc;
      },
      { "Not Shown": 0, "Show Mail": 0, "Mail Viewed": 0, "File Returned": 0 }
    );

    const ctx = document.getElementById("emailStatusChart")?.getContext("2d");
    if (ctx) {
      Chart.getChart("emailStatusChart")?.destroy();

      new Chart(ctx, {
        type: "bar",
        data: {
          labels: ["Not Shown", "Show Mail", "Mail Viewed", "File Returned"],
          datasets: [
            {
              label: "Number of Companies",
              data: [
                emailStatusData["Not Shown"],
                emailStatusData["Show Mail"],
                emailStatusData["Mail Viewed"],
                emailStatusData["File Returned"],
              ],
              backgroundColor: ["#F44336", "#4CAF50", "#2196F3", "#FF9800"],
              borderColor: ["#D32F2F", "#388E3C", "#1976D2", "#F57C00"],
              borderWidth: 1,
            },
          ],
        },
        options: {
          scales: {
            y: {
              beginAtZero: true,
              title: {
                display: true,
                text: "Number of Companies",
              },
            },
            x: {
              title: {
                display: true,
                text: "Email Status",
              },
            },
          },
          plugins: {
            legend: {
              display: false,
            },
          },
        },
      });
    } else {
      console.error("Canvas element 'emailStatusChart' not found");
    }
  }, [loading, companies]);

  // Calculate metrics
  const totalCompanies = companies.length;
  const emailsSent = companies.reduce((sum, company) => sum + (company.emailCount || 0), 0);
  const companiesWithEmailsSent = companies.filter((company) => (company.emailCount || 0) > 0).length;
  const companiesWithMailViewed = companies.filter((company) => company.status === "Mail Viewed").length;
  const companiesWithFileReturned = companies.filter((company) => company.status === "File Returned").length;
  const documentsSubmitted = companies.filter((company) => (company.documents || []).length > 0).length;

  const getDocumentStatus = (company) => {
    if (!company.formSentTimestamp) {
      return "Form Not Sent";
    }
    const now = new Date();
    const formSentTime = new Date(company.formSentTimestamp);
    const daysSinceSent = (now - formSentTime) / (1000 * 60 * 60 * 24);
    
    if (company.documents && company.documents.length > 0) {
      return company.documents.join(", ");
    }
    if (daysSinceSent > 15) {
      return "Not Submitted";
    }
    return "Pending Submission";
  };

  const handleLogout = () => {
    navigate("/login");
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-100">
        <p className="text-lg text-gray-700">Loading...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-100 flex">
      {/* Sidebar */}
      <div
        className={`fixed inset-y-0 left-0 z-30 w-64 bg-gray-800 text-white transform ${
          sidebarOpen ? "translate-x-0" : "-translate-x-full"
        } md:translate-x-0 transition-transform duration-300 ease-in-out`}
      >
        <div className="flex items-center justify-between h-16 px-4 bg-gray-900">
          <h1 className="text-xl font-semibold">Dashboard</h1>
          <button
            className="md:hidden text-white focus:outline-none"
            onClick={() => setSidebarOpen(false)}
          >
            <FaBars />
          </button>
        </div>
        <nav className="mt-4">
          <Link
            to="/"
            className="flex items-center px-4 py-2 hover:bg-gray-700"
            onClick={() => setSidebarOpen(false)}
          >
            <FaHome className="mr-2" /> Home
          </Link>
          <Link
            to="/dashboard"
            className="flex items-center px-4 py-2 bg-gray-700"
            onClick={() => setSidebarOpen(false)}
          >
            <FaChartBar className="mr-2" /> Dashboard
          </Link>
          <button
            onClick={handleLogout}
            className="flex items-center w-full text-left px-4 py-2 hover:bg-gray-700"
          >
            <FaSignOutAlt className="mr-2" /> Logout
          </button>
        </nav>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col md:ml-64">
        {/* Header */}
        <div className="fixed top-0 left-0 right-0 md:left-64 h-16 bg-white shadow-md z-20 flex items-center justify-between px-4">
          <div className="flex items-center">
            <button
              className="md:hidden text-gray-700 focus:outline-none"
              onClick={() => setSidebarOpen(true)}
            >
              <FaBars size={24} />
            </button>
            <h1 className="ml-4 text-xl font-semibold text-gray-800">Report Dashboard</h1>
          </div>
          <div className="flex items-center">
            <span className="text-gray-700 mr-4">{emailUser}</span>
          </div>
        </div>

        {/* Dashboard Content */}
        <div className="mt-16 p-6">
          {/* Metrics Cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
            <div className="bg-white p-6 rounded-lg shadow-md">
              <h2 className="text-lg font-semibold text-gray-800">Total Companies</h2>
              <p className="text-3xl font-bold text-gray-600">{totalCompanies}</p>
            </div>
            <div className="bg-white p-6 rounded-lg shadow-md">
              <h2 className="text-lg font-semibold text-gray-800">Emails Sent</h2>
              <p className="text-3xl font-bold text-gray-600">{emailsSent}</p>
            </div>
            <div className="bg-white p-6 rounded-lg shadow-md">
              <h2 className="text-lg font-semibold text-gray-800">Companies with Emails Sent</h2>
              <p className="text-3xl font-bold text-gray-600">{companiesWithEmailsSent}</p>
            </div>
            <div className="bg-white p-6 rounded-lg shadow-md">
              <h2 className="text-lg font-semibold text-gray-800">Companies with Mail Viewed</h2>
              <p className="text-3xl font-bold text-gray-600">{companiesWithMailViewed}</p>
            </div>
            <div className="bg-white p-6 rounded-lg shadow-md">
              <h2 className="text-lg font-semibold text-gray-800">Companies with File Returned</h2>
              <p className="text-3xl font-bold text-gray-600">{companiesWithFileReturned}</p>
            </div>
            <div className="bg-white p-6 rounded-lg shadow-md">
              <h2 className="text-lg font-semibold text-gray-800">Documents Submitted</h2>
              <p className="text-3xl font-bold text-gray-600">{documentsSubmitted}</p>
            </div>
          </div>

          {/* Email Status Chart and Table */}
          <div className="bg-white p-6 rounded-lg shadow-md">
            <h2 className="text-lg font-semibold text-gray-800 mb-4">Email Status Overview</h2>
            <div className="w-full h-64 mb-6">
              <canvas id="emailStatusChart"></canvas>
            </div>
            <h3 className="text-md font-semibold text-gray-800 mb-4">Company Details</h3>
            <div className="overflow-x-auto">
              <table className="min-w-full border-collapse border border-gray-300">
                <thead>
                  <tr className="bg-gray-100">
                    <th className="border border-gray-300 px-4 py-2 text-left text-sm font-medium text-gray-700">Company Name</th>
                    <th className="border border-gray-300 px-4 py-2 text-left text-sm font-medium text-gray-700">Email Status</th>
                    <th className="border border-gray-300 px-4 py-2 text-left text-sm font-medium text-gray-700">Files Sent</th>
                    <th className="border border-gray-300 px-4 py-2 text-left text-sm font-medium text-gray-700">Last Updated</th>
                  </tr>
                </thead>
                <tbody>
                  {companies.map((company) => (
                    <tr key={company._id} className="border-b border-gray-200">
                      <td className="border border-gray-300 px-4 py-2 text-sm">{company.companyName}</td>
                      <td className="border border-gray-300 px-4 py-2 text-sm">{company.status}</td>
                      <td className="border border-gray-300 px-4 py-2 text-sm">{getDocumentStatus(company)}</td>
                      <td className="border border-gray-300 px-4 py-2 text-sm">{company.lastUpdated || "Never"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;