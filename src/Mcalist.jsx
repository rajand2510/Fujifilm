import React, { useState, useEffect, useRef } from "react";
import { Link } from "react-router-dom";
import Navbar from "./Components/Navbar";
import { FaFileExcel } from "react-icons/fa";

// Utility function to generate random company data
const generateRandomCompanies = (count) => {
  const categories = ["Technology", "Finance", "Healthcare", "Manufacturing", "Retail"];
  const industries = ["Software", "Banking", "Medical Devices", "Automotive", "E-commerce"];
  const statuses = ["Not Shown", "Active", "Inactive", "Pending", "Yes", "No"];
  const companyNames = [
    "Tech", "Global", "Innovate", "Core", "Solutions", "Systems", "Dynamics", "Labs", "Group", "Enterprises"
  ];
  const brands = ["Star", "Pulse", "Wave", "Nex", "Peak", "Flow", "Edge", "Vision", "Tech", "Pro"];
  
  return Array.from({ length: count }, (_, index) => ({
    id: index + 1,
    name: `${companyNames[Math.floor(Math.random() * companyNames.length)]}${Math.floor(Math.random() * 1000)} Ltd`,
    brand: `${brands[Math.floor(Math.random() * brands.length)]}${Math.floor(Math.random() * 100)}`,
    category: categories[Math.floor(Math.random() * categories.length)],
    industry: industries[Math.floor(Math.random() * industries.length)],
    status: "Not Shown",
    email: `contact${index + 1}@${companyNames[Math.floor(Math.random() * companyNames.length)]}.com`.toLowerCase(),
    phone: `+1-${Math.floor(100 + Math.random() * 900)}-${Math.floor(1000 + Math.random() * 9000)}`,
    amount: (300 + Math.floor(Math.random() * 101)).toString(),
    logo: `https://via.placeholder.com/24?text=${index + 1}`,
  }));
};

// Mock email templates for the sub-headers table
const emailTemplates = [
  { id: 1, name: "Welcome Email", subject: "Welcome to Our Platform", body: "Dear {name},\n\nWelcome to our platform! We're excited to have you on board.\n\nBest regards,\nYour Team" },
  { id: 2, name: "Follow-Up Email", subject: "Follow-Up on Your Registration", body: "Dear {name},\n\nWe noticed you haven't completed your registration. Let us know if you need assistance.\n\nBest regards,\nYour Team" },
  { id: 3, name: "Feedback Request", subject: "We'd Love Your Feedback", body: "Dear {name},\n\nWe'd appreciate your feedback on our services. Please let us know your thoughts.\n\nBest regards,\nYour Team" },
];

const Home = ({ toggleMailbox }) => {
  const [sortBy, setSortBy] = useState("Relevance");
  const [sortOrder, setSortOrder] = useState("asc");
  const [isSortDropdownOpen, setIsSortDropdownOpen] = useState(false);
  const [sortSearch, setSortSearch] = useState("");
  const [isActionDropdownOpen, setIsActionDropdownOpen] = useState(false);
  const [filters, setFilters] = useState({
    id: "All",
    name: "All",
    brand: "All",
    category: "All",
    industry: "All",
    status: "All",
    email: "All",
    phone: "All",
  });
  const [selectedRows, setSelectedRows] = useState([]);
  const [companies, setCompanies] = useState(generateRandomCompanies(30));
  const [isMailboxOpen, setIsMailboxOpen] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState(null);
  const [emailSubject, setEmailSubject] = useState("");
  const [emailBody, setEmailBody] = useState("");

  const sortDropdownRef = useRef(null);
  const actionDropdownRef = useRef(null);

  const sortOptions = [
    "Relevance",
    "S.No",
    "Vendor Name",
    "Users Name",
    "Grouping",
    "Division",
    "Status",
    "Email",
    "Phone Number",
    "Amount",
  ];

  const actionOptions = [
    "Edit Data",
    "Delete Data",
    "View Mail",
    "Export Data",
    "Share Data",
  ];

  const filterOptions = {
    id: ["All", ...Array.from({ length: 30 }, (_, i) => (i + 1).toString())],
    name: ["All", ...new Set(companies.map((company) => company.name))],
    brand: ["All", ...new Set(companies.map((company) => company.brand))],
    category: ["All", "Technology", "Finance", "Healthcare", "Manufacturing", "Retail"],
    industry: ["All", "Software", "Banking", "Medical Devices", "Automotive", "E-commerce"],
    status: ["All", "Not Shown", "Active", "Inactive", "Pending", "Yes", "No"],
    email: ["All", ...new Set(companies.map((company) => company.email))],
    phone: ["All", ...new Set(companies.map((company) => company.phone))],
  };

  const filteredCompanies = companies.filter((company) =>
    Object.entries(filters).every(([key, value]) =>
      value === "All" ? true : company[key].toString() === value
    )
  );

  const handleFileUpload = async (event) => {
    // File upload logic remains unchanged
  };

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (sortDropdownRef.current && !sortDropdownRef.current.contains(event.target)) {
        setIsSortDropdownOpen(false);
        setSortSearch("");
      }
      if (actionDropdownRef.current && !actionDropdownRef.current.contains(event.target)) {
        setIsActionDropdownOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

  const SortIconNormal = () => (
    <svg width="12" height="12" viewBox="0 0 16 15" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M8.85736 5.1559L11.2011 2.81215L13.5448 5.15549" stroke="#959595" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M11.2011 8.43713V2.81213" stroke="#959595" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M3.23236 7.49962H7.45105" stroke="#959595" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M3.23236 3.74963H6.51355" stroke="#959595" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M3.23236 11.2496H11.2011" stroke="#959595" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );

  const SortIconHover = () => (
    <svg width="12" height="12" viewBox="0 0 16 15" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M8.85736 5.1559L11.2011 2.81215L13.5448 5.15549" stroke="black" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M11.2011 8.43712V2.81212" stroke="black" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M3.23236 7.49962H7.45105" stroke="black" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M3.23236 3.74962H6.51355" stroke="black" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M3.23236 11.2496H11.2011" stroke="black" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );

  const handleSortOrderToggle = () => {
    setSortOrder(sortOrder === "asc" ? "desc" : "asc");
  };

  const handleSortSelect = (option) => {
    setSortBy(option);
    setIsSortDropdownOpen(false);
    setSortSearch("");
  };

  const handleActionSelect = (option) => {
    if (selectedRows.length === 0) {
      alert("Please select at least one row to perform this action.");
      setIsActionDropdownOpen(false);
      return;
    }

    const selectedCompanies = companies.filter((company) => selectedRows.includes(company.id));

    switch (option) {
      case "Edit Data":
        console.log("Editing selected rows:", selectedCompanies);
        break;
      case "Delete Data":
        setCompanies(companies.filter((company) => !selectedRows.includes(company.id)));
        setSelectedRows([]);
        console.log("Deleted selected rows:", selectedCompanies);
        break;
      case "View Mail":
        console.log("Viewing mail for selected rows:", selectedCompanies);
        break;
      case "Export Data":
        console.log("Exporting selected rows:", selectedCompanies);
        break;
      case "Share Data":
        console.log("Sharing selected rows:", selectedCompanies);
        break;
      default:
        break;
    }
    setIsActionDropdownOpen(false);
  };

  const handleRowCheckboxChange = (id) => {
    setSelectedRows((prev) =>
      prev.includes(id) ? prev.filter((rowId) => rowId !== id) : [...prev, id]
    );
  };

  const handleSelectAll = (e) => {
    if (e.target.checked) {
      setSelectedRows(filteredCompanies.map((company) => company.id));
    } else {
      setSelectedRows([]);
    }
  };

  const handleFilterChange = (column, value) => {
    setFilters((prev) => ({ ...prev, [column]: value }));
  };

  const toggleMailboxInternal = () => {
    setIsMailboxOpen(!isMailboxOpen);
    setSelectedTemplate(null);
    setEmailSubject("");
    setEmailBody("");
  };

  const handleTemplateSelect = (template) => {
    setSelectedTemplate(template);
    setEmailSubject(template.subject);
    let body = template.body;
    if (selectedRows.length === 1) {
      const customer = companies.find((company) => company.id === selectedRows[0]);
      body = body.replace("{name}", customer.name);
      body += `\n\nCustomer Details:\nVendor Name: ${customer.name}\nUsers Name: ${customer.brand}\nEmail: ${customer.email}\nPhone: ${customer.phone}`;
      // Yes/No links are now added in the backend
    }
    setEmailBody(body);
  };

  const handleSendEmail = async () => {
    if (selectedRows.length !== 1) {
      alert("Please select exactly one customer to send the email.");
      return;
    }

    const customer = companies.find((company) => company.id === selectedRows[0]);
    if (!customer) {
      alert("Selected customer not found.");
      return;
    }

    try {
      const response = await fetch('http://localhost:3001/api/send-email', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          to: customer.email,
          subject: emailSubject,
          text: emailBody,
          customerId: customer.id,
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to send email');
      }

      // Update status to "Not Shown" after sending
      setCompanies((prev) =>
        prev.map((company) =>
          company.id === customer.id ? { ...company, status: "Not Shown" } : company
        )
      );

      alert('Email sent successfully!');
      setIsMailboxOpen(false);
      setSelectedTemplate(null);
      setEmailSubject("");
      setEmailBody("");
    } catch (error) {
      console.error('Error sending email:', error);
      alert('Failed to send email. Please try again.');
    }
  };

  return (
    <div className="min-h-screen bg-white overflow-hidden">
      <Navbar onMailtemplateClick={toggleMailboxInternal} />
      <div className="pt-2 pl-0 pr-0">
        {/* Listing Header */}
        <div className="flex items-center mb-1 px-6">
          <div className="flex-1">
            <div className="flex flex-col w-full">
              <div className="flex items-center space-x-2">
                <div className="text-xl font-semibold text-gray-900">Profiled Companies</div>
                <div className="text-gray-600">{filteredCompanies.length.toLocaleString()} Results</div>
                <label className="flex items-center px-3 py-1.5 text-sm text-gray-700 border border-black-300 rounded hover:bg-gray-100">
                  <FaFileExcel className="w-4 h-4 mr-1" />
                  Upload Excel/JSON
                  <input
                    type="file"
                    accept=".xlsx,.xls,.json"
                    onChange={handleFileUpload}
                    className="hidden"
                  />
                </label>
              </div>
              <div className="flex items-center space-x-2">
                <div className="text-sm text-gray-600">Sorted by</div>
                <div className="relative" ref={sortDropdownRef}>
                  <button
                    onClick={() => setIsSortDropdownOpen(!isSortDropdownOpen)}
                    className="text-sm text-gray-600 border-b border-gray-300 focus:outline-none bg-transparent"
                  >
                    {sortBy}
                  </button>
                  {isSortDropdownOpen && (
                    <div className="absolute z-20 mt-1 w-48 bg-white border border-gray-200 rounded shadow-lg max-h-64 overflow-y-auto custom-scrollbar">
                      <div className="p-2 border-b border-gray-200">
                        <input
                          type="text"
                          placeholder="Find Sort Option"
                          value={sortSearch}
                          onChange={(e) => setSortSearch(e.target.value)}
                          className="w-full text-sm border-none focus:outline-none"
                        />
                      </div>
                      {sortOptions
                        .filter((option) => option.toLowerCase().includes(sortSearch.toLowerCase()))
                        .map((option) => (
                          <div
                            key={option}
                            onClick={() => handleSortSelect(option)}
                            className={`p-2 text-sm cursor-pointer hover:bg-gray-100 ${
                              sortBy === option ? "bg-gray-100 font-semibold" : ""
                            }`}
                          >
                            {option}
                          </div>
                        ))}
                    </div>
                  )}
                </div>
                <div className="ml-2 cursor-pointer" onClick={handleSortOrderToggle}>
                  {sortOrder === "asc" ? <SortIconNormal /> : <SortIconHover />}
                </div>
              </div>
            </div>
          </div>
          <div className="flex items-center space-x-3">
            <div className="relative" ref={actionDropdownRef}>
              <button
                onClick={() => setIsActionDropdownOpen(!isActionDropdownOpen)}
                className="flex items-center px-4 py-2 text-base text-white bg-black rounded hover:bg-gray-800"
              >
                Action
                <svg className="w-5 h-5 ml-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
                </svg>
              </button>
              {isActionDropdownOpen && (
                <div className="absolute z-20 mt-1 w-48 bg-white border border-gray-200 rounded shadow-lg">
                  {actionOptions.map((option) => (
                    <div
                      key={option}
                      onClick={() => handleActionSelect(option)}
                      className="p-2 text-sm cursor-pointer hover:bg-gray-100"
                    >
                      {option}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Listing Filter Summary */}
        <div className="listing-filter-summary -mx-6">
          <div className="filter-container mx-0">
            <div className="filter-wrapper">
              {[
                { label: "S.No", key: "id" },
                { label: "Vendor Name", key: "name" },
                { label: "Users Name", key: "brand" },
                { label: "Grouping", key: "category" },
                { label: "Division", key: "industry" },
                { label: "Status", key: "status" },
                { label: "Email", key: "email" },
                { label: "Phone Number", key: "phone" },
              ].map(({ label, key }) => (
                <div key={key} className="filter-item">
                  <span className="filter-label">{`${label}:`}</span>
                  <select
                    value={filters[key]}
                    onChange={(e) => handleFilterChange(key, e.target.value)}
                    className="filter-select"
                  >
                    {filterOptions[key].map((option) => (
                      <option key={option} value={option}>
                        {option}
                      </option>
                    ))}
                  </select>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Table */}
        <div className="table-wrapper overflow-x-auto overflow-y-auto w-full max-h-[calc(100vh-200px)]">
          <table className="min-w-full w-full border-collapse border border-gray-300 table-auto">
            <thead>
              <tr className="bg-gray-100">
                <th className="border-r border-gray-300 px-1 py-1 min-w-[40px] sticky top-0 left-0 bg-gray-100 z-20 text-center">
                  <div className="flex items-center justify-center gap-1">
                    <input
                      type="checkbox"
                      className="w-3 h-3"
                      onChange={handleSelectAll}
                      checked={selectedRows.length === filteredCompanies.length && filteredCompanies.length > 0}
                    />
                    <span className="text-xs font-medium text-gray-700">S.No</span>
                  </div>
                </th>
                <th className="border-r border-gray-300 px-1 py-1 min-w-[120px] sticky top-0 left-[40px] bg-gray-100 z-20 text-center">
                  <span className="text-xs font-medium text-gray-700">Vendor Name</span>
                </th>
                <th className="border-r border-gray-300 px-1 py-1 min-w-[100px] sticky top-0 bg-gray-100 z-10 text-center">
                  <span className="text-xs font-medium text-gray-700">Users Name</span>
                </th>
                <th className="border-r border-gray-300 px-1 py-1 min-w-[80px] sticky top-0 bg-gray-100 z-10 text-center">
                  <span className="text-xs font-medium text-gray-700">Grouping</span>
                </th>
                <th className="border-r border-gray-300 px-1 py-1 min-w-[80px] sticky top-0 bg-gray-100 z-10 text-center">
                  <span className="text-xs font-medium text-gray-700">Division</span>
                </th>
                <th className="border-r border-gray-300 px-1 py-1 min-w-[60px] sticky top-0 bg-gray-100 z-10 text-center">
                  <span className="text-xs font-medium text-gray-700">Status</span>
                </th>
                <th className="border-r border-gray-300 px-1 py-1 min-w-[120px] sticky top-0 bg-gray-100 z-10 text-center">
                  <span className="text-xs font-medium text-gray-700">Email</span>
                </th>
                <th className="border-r border-gray-300 px-1 py-1 min-w-[100px] sticky top-0 bg-gray-100 z-10 text-center">
                  <span className="text-xs font-medium text-gray-700">Phone Number</span>
                </th>
                <th className="border-r border-gray-300 px-1 py-1 min-w-[80px] sticky top-0 bg-gray-100 z-10 text-center">
                  <span className="text-xs font-medium text-gray-700">Amount</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {filteredCompanies.map((company, index) => (
                <tr key={company.id} className="border-b border-gray-200">
                  <td className="border-r border-gray-200 px-1 py-1 min-w-[40px] sticky left-0 bg-white z-10 text-center">
                    <div className="flex items-center justify-center gap-1">
                      <input
                        type="checkbox"
                        className="w-3 h-3"
                        checked={selectedRows.includes(company.id)}
                        onChange={() => handleRowCheckboxChange(company.id)}
                      />
                      <span className="text-xs">{index + 1}</span>
                    </div>
                  </td>
                  <td className="border-r border-gray-200 px-1 py-1 min-w-[120px] truncate sticky left-[40px] bg-white z-10 text-center">
                    <div className="flex items-center justify-center gap-1">
                      <img
                        src={company.logo}
                        alt={`${company.name} logo`}
                        className="w-5 h-5 rounded-full"
                      />
                      <a
                        href={`/company/${company.name.replace(/\s+/g, '-').toLowerCase()}`}
                        className="text-blue-600 hover:underline truncate text-xs"
                      >
                        {company.name}
                      </a>
                    </div>
                  </td>
                  <td className="border-r border-gray-200 px-1 py-1 min-w-[100px] truncate text-center">
                    <Link
                      to={`/company/${company.brand.replace(/\s+/g, '-').toLowerCase()}`}
                      className="text-blue-600 hover:underline truncate text-xs"
                    >
                      {company.brand}
                    </Link>
                  </td>
                  <td className="border-r border-gray-200 px-1 py-1 min-w-[80px] truncate text-center text-xs">{company.category}</td>
                  <td className="border-r border-gray-200 px-1 py-1 min-w-[80px] truncate text-center text-xs">{company.industry}</td>
                  <td className="border-r border-gray-200 px-1 py-1 min-w-[60px] truncate text-center text-xs">{company.status}</td>
                  <td className="border-r border-gray-200 px-1 py-1 min-w-[120px] truncate text-center text-xs">{company.email}</td>
                  <td className="border-r border-gray-200 px-1 py-1 min-w-[100px] truncate text-center text-xs">{company.phone}</td>
                  <td className="border-r border-gray-200 px-1 py-1 min-w-[80px] truncate text-center text-xs">{company.amount}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Mailbox Modal */}
        {isMailboxOpen && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white rounded-lg w-3/4 h-3/4 flex">
              {/* Sidebar: Sub-Headers Table */}
              <div className="w-1/4 bg-gray-100 border-r border-gray-200 p-4 overflow-y-auto">
                <h3 className="text-lg font-semibold mb-4">Email Templates</h3>
                <table className="w-full border-collapse">
                  <thead>
                    <tr className="bg-gray-200">
                      <th className="border border-gray-300 px-2 py-1 text-left text-sm">Template Name</th>
                    </tr>
                  </thead>
                  <tbody>
                    {emailTemplates.map((template) => (
                      <tr
                        key={template.id}
                        className={`cursor-pointer hover:bg-gray-300 ${
                          selectedTemplate && selectedTemplate.id === template.id ? "bg-gray-300" : ""
                        }`}
                        onClick={() => handleTemplateSelect(template)}
                      >
                        <td className="border border-gray-300 px-2 py-1 text-sm">{template.name}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {/* Main Email Section */}
              <div className="w-3/4 p-4 flex flex-col">
                <div className="flex justify-between items-center mb-4">
                  <h3 className="text-lg font-semibold">Compose Email</h3>
                  <button
                    onClick={toggleMailboxInternal}
                    className="text-gray-500 hover:text-gray-700"
                  >
                    ✕
                  </button>
                </div>
                {selectedRows.length !== 1 ? (
                  <p className="text-red-500">Please select exactly one customer to send an email.</p>
                ) : (
                  <>
                    <input
                      type="text"
                      value={emailSubject}
                      onChange={(e) => setEmailSubject(e.target.value)}
                      placeholder="Subject"
                      className="w-full px-3 py-2 border border-gray-300 rounded mb-4 focus:outline-none"
                    />
                    <textarea
                      value={emailBody}
                      onChange={(e) => setEmailBody(e.target.value)}
                      placeholder="Email body"
                      className="w-full h-3/4 px-3 py-2 border border-gray-300 rounded focus:outline-none resize-none"
                    />
                    <div className="mt-4 flex justify-end">
                      <button
                        onClick={handleSendEmail}
                        className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
                      >
                        Send Email
                      </button>
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      <style jsx>{`
        .custom-scrollbar::-webkit-scrollbar {
          width: 6px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: #f1f1f1;
          border-radius: 10px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: #d1d1d1;
          border-radius: 10px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover {
          background: #b0b0b0;
        }

        .table-wrapper::-webkit-scrollbar {
          height: 6px;
          width: 6px;
        }
        .table-wrapper::-webkit-scrollbar-track {
          background: #f1f1f1;
          border-radius: 10px;
        }
        .table-wrapper::-webkit-scrollbar-thumb {
          background: #d1d1d1;
          border-radius: 10px;
        }
        .table-wrapper::-webkit-scrollbar-thumb:hover {
          background: #b0b0b0;
        }

        .listing-filter-summary {
          margin-left: 0 !important;
          margin-right: 0 !important;
        }

        .filter-container {
          background-color: #ffffff;
          border-top: 2px solid #4a5568;
          border-bottom: 2px solid #4a5568;
          padding: 8px 0;
          box-shadow: 0 2px 4px rgba(0, 0, 0, 0.08);
        }

        .filter-wrapper {
          display: flex;
          flex-wrap: wrap;
          gap: 12px;
          padding: 0 16px;
          overflow-x: auto;
          align-items: center;
        }

        .filter-item {
          display: flex;
          align-items: center;
          background: #f7fafc;
          border: 1px solid #e2e8f0;
          border-radius: 6px;
          padding: 6px 10px;
          box-shadow: 0 1px 2px rgba(0, 0, 0, 0.06);
          transition: transform 0.2s ease, box-shadow 0.2s ease;
          min-width: 150px;
        }

        .filter-item:hover {
          transform: translateY(-2px);
          box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
        }

        .filter-label {
          font-size: 12px;
          font-weight: 600;
          color: #2d3748;
          margin-right: 6px;
          white-space: nowrap;
        }

        .filter-select {
          font-size: 12px;
          color: #4a5568;
          border: 1px solid #cbd5e0;
          background: #ffffff;
          outline: none;
          padding: 4px 8px;
          border-radius: 4px;
          transition: border-color 0.2s ease, background-color 0.2s ease;
          cursor: pointer;
          flex: 1;
        }

        .filter-select:hover {
          background-color: #f1f5f9;
          border-color: #a0aec0;
        }

        .filter-select:focus {
          border-color: #3182ce;
          background-color: #edf2f7;
          outline: none;
        }

        table {
          font-size: 12px;
        }
        th, td {
          line-height: 1.2;
          padding: 4px !important;
        }
      `}</style>
    </div>
  );
};

export default Home;