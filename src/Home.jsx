import React, { useState, useEffect, useRef } from "react";
import { Link } from "react-router-dom";
import Navbar from "./Components/Navbar";
import { FaFileExcel, FaPlus } from "react-icons/fa";
import { io } from "socket.io-client";
import * as XLSX from "xlsx";
import { saveAs } from "file-saver";
import { X, Mail, Paperclip, Send } from "lucide-react";
import logo from "./assets/logo_06.png";

const BASE_URL = "http://localhost:3003";
const socket = io(BASE_URL, {
  reconnection: true,
  reconnectionAttempts: 5,
  reconnectionDelay: 3000,
});

const emailTemplates = [
  // { id: 1, name: "Welcome Email", subject: "Welcome to Our Platform", body: "Dear {name},\n\nWelcome to our platform! We're excited to have you on board.\n\nBest regards,\nYour Team" },
  // { id: 2, name: "Follow-Up Email", subject: "Follow-Up on Your Registration", body: "Dear {name},\n\nWe noticed you haven't completed your registration. Let us know if you need assistance.\n\nBest regards,\nYour Team" },
  // { id: 3, name: "Feedback Request", subject: "We'd Love Your Feedback", body: "Dear {name},\n\nWe'd appreciate your feedback on our services. Please let us know your thoughts.\n\nBest regards,\nYour Team" },
  { id: 4, name: "Form Submission Request", subject: "Please Submit Your Documents", body: `Dear {name},\n\nPlease fill out and submit the attached form within 15 days. You can upload your documents using the link below:\n\nSubmission Link: ${BASE_URL}/submit-documents/{id}\n\nBest regards,\nYour Team` },
];

const Home = ({ toggleMailbox }) => {
  const [isActionDropdownOpen, setIsActionDropdownOpen] = useState(false);
  const [isFilterDropdownOpen, setIsFilterDropdownOpen] = useState(false);
  const [isAddCustomerOpen, setIsAddCustomerOpen] = useState(false); // New state for Add Customer modal
  const [addCustomerData, setAddCustomerData] = useState({ // New state for form data
    companyName: "",
    username: "",
    groupName: "",
    division: "",
    email: "",
    phoneNumber: "",
    billAmount: "",
  });
  const [filters, setFilters] = useState({
    id: [],
    companyName: [],
    username: [],
    groupName: [],
    division: [],
    status: [],
    email: [],
    phoneNumber: [],
    lastUpdated: [],
  });
  const [filterSearch, setFilterSearch] = useState({
    id: "",
    companyName: "",
    username: "",
    groupName: "",
    division: "",
    status: "",
    email: "",
    phoneNumber: "",
    lastUpdated: "",
  });
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedRows, setSelectedRows] = useState([]);
  const [companies, setCompanies] = useState([]);
  const [metrics, setMetrics] = useState({
    companyCount: 0,
    emailSent: 0,
    formSent: 0,
    mailViewed: 0,
    responded: 0,
    fileReturned: 0,
  });
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false); // Added for better UX
  const [isMailboxOpen, setIsMailboxOpen] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState(null);
  const [emailSubject, setEmailSubject] = useState("");
  const [emailBody, setEmailBody] = useState("");

  const [editableEmails, setEditableEmails] = useState({});
  const [emailUser, setEmailUser] = useState("");
  const [isSendingEmails, setIsSendingEmails] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editData, setEditData] = useState(null);
  const [isExporting, setIsExporting] = useState(false);
  const [exportEmail, setExportEmail] = useState("granthviramoliya22@gmail.com");
  const [successMessage, setSuccessMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const [selectedCompanyForHistory, setSelectedCompanyForHistory] = useState(null);
  const [isDocumentsModalOpen, setIsDocumentsModalOpen] = useState(false);
  const [selectedCompanyForDocuments, setSelectedCompanyForDocuments] = useState(null);
  const [sortConfig, setSortConfig] = useState({ key: null, direction: "ascending" });
  // const [companyStatus, setCompanyStatus] = useState(companies.status);
  const [ccEmail, setCcEmail] = useState("");
  const [attachedFile, setAttachedFile] = useState(null);

  const [errors, setErrors] = useState({
    email: "",
    phoneNumber: "",
  });
  const [suggestions, setSuggestions] = useState([]); // For search suggestions
  const [isSuggestionDropdownOpen, setIsSuggestionDropdownOpen] = useState(false); // To control suggestion dropdown

  const actionDropdownRef = useRef(null);
  const filterDropdownRef = useRef(null);
  const fileInputRef = useRef(null);

  const actionOptions = [
    "Edit Data",
    "Delete Data",
    "Export Data",
    "Send Mail",
    "Resend Failed Emails",
    // "Send Quarterly Reminders",
  ];

  // Calculate metrics based on company data
  const calculateMetrics = (companiesData) => {
    const companyCount = companiesData.length; // Total number of companies
    const emailSent = companiesData.filter((c) => c.status === "Email Sent").length;




    // Companies with at least one email sent
    // const formSent = companiesData.filter(
    //   (c) => c.formSentTimestamp && c.emailStatus === "Sent"
    // ).length; // Companies with a form sent (timestamp exists) and email status is "Sent"


    const formSent = companiesData.filter(
      (c) => Array.isArray(c.documents) && c.documents.length === 0
    ).length;

    const mailViewed = companiesData.filter((c) => c.status === "Show Mail").length; // Companies where email was viewed
    const responded = companiesData.filter(
      (c) => c.documentSubmitted || c.status === "Failed"
    ).length; // Companies that either submitted documents or have status "Response Received"
    const fileReturned = companiesData.filter(
      (c) =>
        c.documents &&
        c.documents.length > 0 &&
        c.status !== "Payment Not Agreed"
    ).length;

    setMetrics({
      companyCount,
      emailSent,
      formSent,
      mailViewed,
      responded,
      fileReturned,
    });
  };

  useEffect(() => {
    const fetchCompanies = async () => {
      try {
        const response = await fetch(`${BASE_URL}/api/companies`);
        if (!response.ok) throw new Error(`Failed to fetch companies: ${response.statusText}`);
        const data = await response.json();
        const processedData = data.map((company) => {
          let documents = company.documents || [];
          if (typeof company.documents === 'string') {
            try {
              documents = JSON.parse(company.documents) || [];
            } catch (e) {
              console.error(`Failed to parse documents for company ${company._id}:`, e.message, company.documents);
              documents = company.documents ? [company.documents] : [];
            }
          }
          return {
            ...company,
            companyName: company.companyName || "N/A",
            username: company.username || "N/A",
            groupName: company.groupName || "N/A",
            division: company.division || "N/A",
            status: company.status || "Pending",
            email: company.email || "N/A",
            phoneNumber: company.phoneNumber || "N/A",
            lastUpdated: company.lastUpdated || "Never",
            documents,
            formSentTimestamp: company.formSentTimestamp || null,
            emailCount: company.emailCount || 0,
            receivedEmails: company.receivedEmails ? JSON.parse(company.receivedEmails) : [],
            sentEmails: company.sentEmails ? JSON.parse(company.sentEmails) : [],
            invoiceNo: company.invoiceNo || "N/A",
            invoiceDate: company.invoiceDate || null,
            billAmount: company.billAmount || null,
            emailStatus: company.emailStatus || "Pending",
            documentSubmitted: company.documentSubmitted || false,
          };
        });
        setCompanies(processedData);
        calculateMetrics(processedData);
      } catch (error) {
        setErrorMessage(error.message);
        setTimeout(() => setErrorMessage(""), 5000);
      } finally {
        setLoading(false);
      }
    };

    const fetchEmailUser = async () => {
      try {
        const response = await fetch(`${BASE_URL}/api/get-email-user`);
        if (!response.ok) throw new Error(`Failed to fetch email user: ${response.statusText}`);
        const data = await response.json();
        setEmailUser(data.emailUser || "Unknown User");
      } catch (error) {
        console.error("Error fetching email user:", error.message);
        setEmailUser("Unknown User");
      }
    };

    fetchCompanies();
    fetchEmailUser();

    socket.on("connect", () => console.log("Socket connected:", socket.id));
    socket.on("connect_error", (err) => console.error("Socket connection error:", err.message));
    socket.on("companiesUploaded", (newCompanies) => {
      setCompanies((prev) => {
        const updatedCompanies = [
          ...newCompanies.map((company) => {
            let documents = company.documents || [];
            if (typeof company.documents === 'string') {
              try {
                documents = JSON.parse(company.documents) || [];
              } catch (e) {
                console.error(`Failed to parse documents for new company ${company._id}:`, e.message, company.documents);
                documents = company.documents ? [company.documents] : [];
              }
            }
            return {
              ...company,
              companyName: company.companyName || "N/A",
              username: company.username || "N/A",
              groupName: company.groupName || "N/A",
              division: company.division || "N/A",
              status: company.status || "Pending",
              email: company.email || "N/A",
              phoneNumber: company.phoneNumber || "N/A",
              lastUpdated: company.lastUpdated || "Never",
              documents,
              formSentTimestamp: company.formSentTimestamp || null,
              emailCount: company.emailCount || 0,
              receivedEmails: company.receivedEmails ? JSON.parse(company.receivedEmails) : [],
              sentEmails: company.sentEmails ? JSON.parse(company.sentEmails) : [],
              invoiceNo: company.invoiceNo || "N/A",
              invoiceDate: company.invoiceDate || null,
              billAmount: company.billAmount || null,
              emailStatus: company.emailStatus || "Pending",
              documentSubmitted: company.documentSubmitted || false,
            };
          }),
          ...prev,
        ];
        calculateMetrics(updatedCompanies);
        return updatedCompanies;
      });
      setSuccessMessage("Companies uploaded successfully!");
      setTimeout(() => setSuccessMessage(""), 5000);
    });

    socket.on("companyUpdated", (updatedDoc) => {
      setCompanies((prev) => {
        const updatedCompanies = prev.map((doc) => {
          if (doc._id !== updatedDoc._id) return doc;
          let documents = updatedDoc.documents || [];
          if (typeof updatedDoc.documents === 'string') {
            try {
              documents = JSON.parse(updatedDoc.documents) || [];
            } catch (e) {
              console.error(`Failed to parse documents for updated company ${updatedDoc._id}:`, e.message, updatedDoc.documents);
              documents = updatedDoc.documents ? [updatedDoc.documents] : [];
            }
          }
          return {
            ...updatedDoc,
            companyName: updatedDoc.companyName || "N/A",
            username: updatedDoc.username || "N/A",
            groupName: updatedDoc.groupName || "N/A",
            division: updatedDoc.division || "N/A",
            status: updatedDoc.status || "Pending",
            email: updatedDoc.email || "N/A",
            phoneNumber: updatedDoc.phoneNumber || "N/A",
            lastUpdated: updatedDoc.lastUpdated || "Never",
            documents,
            formSentTimestamp: updatedDoc.formSentTimestamp || null,
            emailCount: updatedDoc.emailCount || 0,
            receivedEmails: updatedDoc.receivedEmails ? JSON.parse(updatedDoc.receivedEmails) : [],
            sentEmails: updatedDoc.sentEmails ? JSON.parse(updatedDoc.sentEmails) : [],
            invoiceNo: updatedDoc.invoiceNo || "N/A",
            invoiceDate: updatedDoc.invoiceDate || null,
            billAmount: updatedDoc.billAmount || null,
            emailStatus: updatedDoc.emailStatus || "Pending",
            documentSubmitted: updatedDoc.documentSubmitted || false,
          };
        });
        calculateMetrics(updatedCompanies);
        return updatedCompanies;
      });
      setSuccessMessage("Company updated successfully!");
      setTimeout(() => setSuccessMessage(""), 5000);
    });



    socket.on("companyDeleted", (companyId) => {
      setCompanies((prev) => {
        const updatedCompanies = prev.filter((company) => company._id !== companyId);
        calculateMetrics(updatedCompanies);
        return updatedCompanies;
      });
      setSuccessMessage("Company deleted successfully!");
      setTimeout(() => setSuccessMessage(""), 5000);
    });

    return () => {
      socket.off("connect");
      socket.off("connect_error");
      socket.off("companiesUploaded");
      socket.off("companyUpdated");
      socket.off("companyDeleted");
    };
  }, []);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (actionDropdownRef.current && !actionDropdownRef.current.contains(event.target)) {
        setIsActionDropdownOpen(false);
      }
      if (filterDropdownRef.current && !filterDropdownRef.current.contains(event.target)) {
        setIsFilterDropdownOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  useEffect(() => {
    if (isMailboxOpen) {
      const selectedCompanies = companies.filter((company) => selectedRows.includes(company._id));
      const initialEmails = {};
      selectedCompanies.forEach((company) => {
        initialEmails[company._id] = company.email || "";
      });
      setEditableEmails(initialEmails);
    }
  }, [isMailboxOpen, companies, selectedRows]);

  const filterOptions = {
    id: ["All", ...Array.from(new Set(companies.map((company) => company.srNo || company._id)))],
    companyName: ["All", ...new Set(companies.map((company) => company.companyName))],
    username: ["All", ...new Set(companies.map((company) => company.username))],
    groupName: ["All", ...new Set(companies.map((company) => company.groupName))],
    division: ["All", ...new Set(companies.map((company) => company.division))],
    status: [
      "All",
      "Not Shown",
      "Email Sent",
      "Response Received",
      "Payment Confirmed",
      "Failed",
      "Payment Not Agreed",
    ],
    email: ["All", ...new Set(companies.map((company) => company.email))],
    phoneNumber: ["All", ...new Set(companies.map((company) => company.phoneNumber || "N/A"))],
    lastUpdated: ["All", ...new Set(companies.map((company) => company.lastUpdated || "Never"))],
  };

  // Update filtering logic to handle multiple values
  let filteredCompanies = companies.filter((company) =>
    Object.entries(filters).every(([key, values]) => {
      if (values.length === 0 || values.includes("All")) return true;
      const companyValue = company[key]?.toString().toLowerCase() || "n/a";
      return values.some((value) => value.toLowerCase() === companyValue);
    })
  );

  if (searchTerm) {
    filteredCompanies = filteredCompanies.filter(
      (company) =>
        company.companyName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        company.email?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        company.srNo?.toString().includes(searchTerm.toLowerCase())
    );
  }
  useEffect(() => {
    const fetchSuggestions = async () => {
      if (searchTerm.length < 2) {
        setSuggestions([]);
        setIsSuggestionDropdownOpen(false);
        return;
      }

      try {
        const response = await fetch("http://localhost:3003/api/companies");
        if (!response.ok) {
          throw new Error("Failed to fetch companies for suggestions");
        }
        const companies = await response.json();
        const filteredSuggestions = companies
          .filter((company) =>
            company.companyName?.toLowerCase().includes(searchTerm.toLowerCase())
          )
          .map((company) => company.companyName);
        setSuggestions(filteredSuggestions);
        setIsSuggestionDropdownOpen(filteredSuggestions.length > 0);
      } catch (error) {
        console.error("Error fetching suggestions:", error.message);
        setSuggestions([]);
        setIsSuggestionDropdownOpen(false);
      }
    };

    fetchSuggestions();
  }, [searchTerm]);

  const handleSearchChange = (e) => {
    const value = e.target.value;
    setSearchTerm(value);
    // Pass the search term to the parent (Home.js)
  };

  // Handle selecting a suggestion
  const handleSuggestionClick = (suggestion) => {
    setSearchTerm(suggestion);
    setIsSuggestionDropdownOpen(false);
  };

  const sortData = (key) => {
    let direction = "ascending";
    if (sortConfig.key === key && sortConfig.direction === "ascending") {
      direction = "descending";
    }
    setSortConfig({ key, direction });

    const sortedData = [...filteredCompanies].sort((a, b) => {
      let aValue = a[key];
      let bValue = b[key];

      if (key === "id") {
        aValue = a.srNo || a._id;
        bValue = b.srNo || b._id;
      } else if (key === "invoiceDate" || key === "lastUpdated") {
        aValue = a[key] === "Never" || !a[key] ? 0 : new Date(a[key]).getTime();
        bValue = b[key] === "Never" || !b[key] ? 0 : new Date(b[key]).getTime();
      } else if (key === "billAmount") {
        aValue = a[key] ? parseFloat(a[key]) : 0;
        bValue = b[key] ? parseFloat(b[key]) : 0;
      } else {
        aValue = a[key] || "N/A";
        bValue = b[key] || "N/A";
      }

      if (aValue < bValue) return direction === "ascending" ? -1 : 1;
      if (aValue > bValue) return direction === "ascending" ? 1 : -1;
      return 0;
    });

    filteredCompanies = sortedData;
  };

  const isAllSelected = selectedRows.length === filteredCompanies.length && filteredCompanies.length > 0;

  // Handle Add Customer Form Changes
  const handleAddCustomerChange = (field, value) => {
    setAddCustomerData((prev) => ({ ...prev, [field]: value }));

    // Validation logic
    if (field === "email") {
      setErrors((prev) => ({
        ...prev,
        email: validateEmail(value) ? "" : "Invalid email address",
      }));
    }
    if (field === "phoneNumber") {
      setErrors((prev) => ({
        ...prev,
        phoneNumber: validatePhoneNumber(value) ? "" : "Invalid phone number",
      }));
    }
  };

  const validateEmail = (email) => {
    // Simple regex for basic email validation
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  };

  const validatePhoneNumber = (phone) => {
    // Example: 10-digit number, adjust as per your requirements
    return /^\d{10}$/.test(phone);
  };



  // Handle Add Customer Form Submission
  // Handle Add Customer Form Submission
  const handleAddCustomerSubmit = async () => {
    setActionLoading(true);
    try {
      const response = await fetch(`${BASE_URL}/api/companies/add`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          companyName: addCustomerData.companyName,
          username: addCustomerData.username,
          groupName: addCustomerData.groupName,
          division: addCustomerData.division,
          email: addCustomerData.email,
          phoneNumber: addCustomerData.phoneNumber,
          billAmount: addCustomerData.billAmount,
          status: "Not Shown",
          lastUpdated: new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata" }),
        }),
      });

      if (!response.ok) throw new Error(`Failed to add customer: ${response.statusText}`);
      setSuccessMessage("Customer added successfully!");
      setIsAddCustomerOpen(false);
      setAddCustomerData({
        companyName: "",
        username: "",
        groupName: "",
        division: "",
        email: "",
        phoneNumber: "",
        billAmount: "",
      });
      // Refresh the page after successful addition
      window.location.reload();
    } catch (error) {
      setErrorMessage(error.message);
      setTimeout(() => setErrorMessage(""), 3000);
    } finally {
      setActionLoading(false);
      setTimeout(() => setSuccessMessage("New Customer added"), 5000);
    }
  };


  const handleFileUpload = async (event) => {
    const file = event.target.files[0];
    if (!file) {
      setErrorMessage("No file selected.");
      setTimeout(() => setErrorMessage(""), 3000);
      return;
    }

    setActionLoading(true);
    const formData = new FormData();
    formData.append("file", file);
    console.log("Uploading file:", formData);
    try {
      const response = await fetch(`${BASE_URL}/api/companies/upload`, {
        method: "POST",
        body: formData,
      });
      if (!response.ok) throw new Error(`Failed to upload file: ${response.statusText}`);
      const data = await response.json();
      setSuccessMessage("Data uploaded successfully!");
      if (fileInputRef.current) fileInputRef.current.value = "";
    } catch (error) {
      setErrorMessage(`Failed to upload file: ${error.message}`);
      setTimeout(() => setErrorMessage(""), 3000);
    } finally {
      setActionLoading(false);
      setTimeout(() => setSuccessMessage(""), 5000);
    }
  };

  const handleActionSelect = async (option) => {
    // Only show the message if no rows are selected AND the option is NOT "Resend Failed Emails"
    if (selectedRows.length === 0 && option !== "Resend Failed Emails") {
      setSuccessMessage("Please select at least one row to handle this action.");
      setTimeout(() => setSuccessMessage(""), 3000);
      return;
    }

    const selectedCompanies = companies.filter((company) => selectedRows.includes(company._id));

    switch (option) {
      case "Edit Data":
        if (selectedRows.length !== 1) {
          setSuccessMessage("Please select exactly one row to edit.");
          setTimeout(() => setSuccessMessage(""), 1000);
          return;
        }
        setEditData(selectedCompanies[0]);
        setIsEditing(true);
        break;
      case "Delete Data":
        if (!window.confirm("Are you sure you want to delete the selected companies?")) return;
        setActionLoading(true);
        try {
          await Promise.all(
            selectedCompanies.map(async (company) => {
              const response = await fetch(`${BASE_URL}/api/companies/${company._id}`, {
                method: "DELETE",
              });
              if (!response.ok) throw new Error(`Failed to delete ${company._id}`);
            })
          );
          setSuccessMessage("Selected companies deleted successfully!");
          setSelectedRows([]);
        } catch (error) {
          setErrorMessage(error.message);
          setTimeout(() => setErrorMessage(""), 3000);
        } finally {
          setActionLoading(false);
          setTimeout(() => setSuccessMessage(""), 3000);
        }
        break;
      case "Export Data":
        setIsExporting(true);
        break;
      case "Send Mail": {
        const formSubmissionTemplate = emailTemplates.find(
          (template) => template.name === "Form Submission Request"
        );
        setSelectedTemplate(formSubmissionTemplate);
        setEmailSubject(formSubmissionTemplate.subject);
        setEmailBody(formSubmissionTemplate.body);
        setIsMailboxOpen(true);
        break;
      }
      case "Resend Failed Emails":
        await handleResendFailedEmails();
        break;
      case "Send Quarterly Reminders":
        await handleSendQuarterlyReminders();
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
      setSelectedRows(filteredCompanies.map((company) => company._id));
    } else {
      setSelectedRows([]);
    }
  };

  const handleFilterChange = (column, value) => {
    setFilters((prev) => {
      const currentValues = prev[column];
      let newValues;
      if (value === "All") {
        newValues = currentValues.includes("All") ? [] : ["All"];
      } else {
        newValues = currentValues.includes(value)
          ? currentValues.filter((v) => v !== value)
          : [...currentValues.filter((v) => v !== "All"), value];
      }
      return { ...prev, [column]: newValues };
    });
  };

  const handleFilterSearchChange = (column, value) => {
    setFilterSearch((prev) => ({ ...prev, [column]: value }));
  };

  const handleRemoveFilter = (column) => {
    setFilters((prev) => ({ ...prev, [column]: [] }));
    setFilterSearch((prev) => ({ ...prev, [column]: "" }));
  };
  const handleDownloadDocument = (filename) => {
    window.open(`${BASE_URL}/documents/${filename}`, "_blank");
  };

  const handleViewDocuments = (company) => {
    let documents = company.documents || [];
    if (typeof company.documents === 'string') {
      try {
        documents = JSON.parse(company.documents) || [];
      } catch (e) {
        console.error(`Failed to parse documents for company ${company._id}:`, e.message, company.documents);
        documents = company.documents ? [company.documents] : [];
      }
    }
    console.log('Opening modal for company:', company.companyName, 'Status:', company.status, 'Documents:', documents);
    setSelectedCompanyForDocuments({ ...company, documents });
    setIsDocumentsModalOpen(true);
  };

  const handleResendFailedEmails = async () => {
    setActionLoading(true);
    try {
      const response = await fetch(`${BASE_URL}/api/resend-failed-emails`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      if (!response.ok) throw new Error(`Failed to resend emails: ${response.statusText}`);
      const data = await response.json();
      setSuccessMessage(`Resending failed emails completed: ${data.report.sent} sent, ${data.report.failed} failed.`);
    } catch (error) {
      setErrorMessage(error.message);
    } finally {
      setActionLoading(false);
      setTimeout(() => setSuccessMessage(""), 5000);
      setTimeout(() => setErrorMessage(""), 5000);
    }
  };

  const handleSendQuarterlyReminders = async () => {
    setActionLoading(true);
    try {
      const response = await fetch(`${BASE_URL}/api/send-quarterly-reminders`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      if (!response.ok) throw new Error(`Failed to send quarterly reminders: ${response.statusText}`);
      const data = await response.json();
      setSuccessMessage(`Quarterly reminders sent: ${data.report.sent} sent, ${data.report.failed} failed.`);
    } catch (error) {
      setErrorMessage(error.message);
    } finally {
      setActionLoading(false);
      setTimeout(() => setSuccessMessage(""), 5000);
      setTimeout(() => setErrorMessage(""), 5000);
    }
  };

  const handleTemplateSelect = (template) => {
    setSelectedTemplate(template);
    setEmailSubject(template.subject);
    setEmailBody(template.body);
  };

  const handleEmailChange = (companyId, newEmail) => {
    setEditableEmails((prev) => ({
      ...prev,
      [companyId]: newEmail,
    }));
  };

  // Place these inside your component

  // --- 1. sendEmailWithTimeout ---
  const sendEmailWithTimeout = async ({
    companyId,
    subject,
    body,
    ccEmail,
    attachedFile,
    maxRetries = 2,
    timeout = 500,
  }) => {
    let attempt = 0;
    const timestamp = new Date().toISOString();

    while (attempt <= maxRetries) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), timeout);

        const formData = new FormData();
        formData.append("companyId", companyId);
        formData.append("subject", subject);
        formData.append("body", body);
        formData.append("timestamp", timestamp);
        if (ccEmail) formData.append("cc", ccEmail);
        if (attachedFile) formData.append("attachment", attachedFile);

        const response = await fetch(`${BASE_URL}/api/send-single-email`, {
          method: "POST",
          body: formData,
          signal: controller.signal,
        });

        clearTimeout(timeoutId);

        const data = await response.json();

        if (response.status === 200) {
          return { success: true, companyId, message: data.message, timestamp };
        } else {
          throw new Error(data.error || "Failed to send email");
        }
      } catch (error) {
        console.error(`Attempt ${attempt + 1} failed for company ${companyId}: ${error.message}`);
        attempt++;
        if (attempt > maxRetries) {
          return { success: false, companyId, error: error.message };
        }
        // Wait 1 second before retrying
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }
    }
  };

  // --- 2. handleSendEmail ---
  const handleSendEmail = async () => {
    if (selectedRows.length === 0) {
      setErrorMessage("Please select at least one company to send the email.");
      setTimeout(() => setErrorMessage(""), 5000);
      return;
    }

    setIsSendingEmails(true);

    try {
      const results = [];
      for (let i = 0; i < selectedRows.length; i++) {
        const companyId = selectedRows[i];
        const result = await sendEmailWithTimeout({
          companyId,
          subject: emailSubject,
          body: emailBody,
          ccEmail,
          attachedFile,
        });
        results.push(result);

        // Optional: Wait between sends (e.g., 60 seconds)
        if (i < selectedRows.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
      }

      // Update lastEmailSent for each successful email
      const updatePromises = results
        .filter(result => result.success)
        .map(result =>
          fetch(`${BASE_URL}/api/companies/${result.companyId}`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ lastEmailSent: result.timestamp }),
          })
        );
      await Promise.all(updatePromises);

      const successes = results.filter(result => result.success);
      const failures = results.filter(result => !result.success);

      let message = "";
      if (successes.length > 0) {
        message += `${successes.length} email${successes.length > 1 ? "s" : ""} sent successfully`;
      }
      if (failures.length > 0) {
        message += `${message ? ". " : ""}${failures.length} email${failures.length > 1 ? "s" : ""} failed: ${failures.map(f => f.companyId).join(", ")}`;
        console.error("Failed emails:", failures);
      }

      setSuccessMessage(message || "No emails were sent.");

      // Update local state to reflect lastEmailSent
      setCompanies(prev =>
        prev.map(company => {
          const result = results.find(r => r.companyId === company._id);
          if (result?.success) {
            return { ...company, lastEmailSent: result.timestamp };
          }
          return company;
        })
      );
    } catch (error) {
      setErrorMessage(error.message);
    } finally {
      setIsMailboxOpen(false);
      setSelectedTemplate(null);
      setEmailSubject("");
      setEmailBody("");
      setAttachedFile(null);
      setEditableEmails({});
      setIsSendingEmails(false);
      setTimeout(() => setSuccessMessage(""), 5000);
      setTimeout(() => setErrorMessage(""), 5000);
    }
  };





  // const getDocumentStatus = (company) => {
  //   if (company.documentSubmitted && company.documents && company.documents.length > 0) {
  //     return (
  //       <button
  //         onClick={() => handleViewDocuments(company)}
  //         className="text-blue-600 text-sm hover:underline"
  //       >
  //         View Documents ({company.documents.length})
  //       </button>
  //     );
  //   }
  //   if (!company.formSentTimestamp) return "Form Not Sent";
  //   const now = new Date();
  //   const formSentTime = new Date(company.formSentTimestamp);
  //   const daysSinceSent = (now - formSentTime) / (1000 * 60 * 60 * 24);
  //   if (daysSinceSent > 15) return "Expired";
  //   return "Pending Submission";
  // };

  const getDocumentStatus = (company) => {
    let documents = company.documents || [];
    if (typeof company.documents === 'string') {
      try {
        documents = JSON.parse(company.documents) || [];
      } catch (e) {
        console.error(`Failed to parse documents for company ${company._id}:`, e.message, company.documents);
        documents = company.documents ? [company.documents] : [];
      }
    }
    if (company.documentSubmitted == 0 && documents.length > 0) {
      if (company.status === "Payment Not Agreed") {
        return (
          <div className="flex items-center space-x-2 pl-1">

            <button
              onClick={() => handleViewDocuments(company)}
              className="text-red-600 text-sm hover:underline"
            >
              View Reason
            </button>
          </div>
        );
      }

    }
    if (company.documentSubmitted > 0 && documents.length > 0) {
      if (company.status === "Response Received") {
        return (
          <button
            onClick={() => handleViewDocuments(company)}
            className="text-blue-600 text-sm hover:underline"
          >
            View Documents ({documents.length})
          </button>
        );

      }

    }


    if (!company.formSentTimestamp) return "Form Not Sent";
    const now = new Date();
    const formSentTime = new Date(company.formSentTimestamp);
    const daysSinceSent = (now - formSentTime) / (1000 * 60 * 60 * 24);
    if (daysSinceSent > 15) return "Expired";
    return "Pending Submission";
  };

  // Update handleViewDocuments to handle reasons
  // const handleViewDocuments = (company) => {
  //   if (company.status === "Payment Not Agreed") {
  //     alert(`Reason for disagreement: ${company.documents[0]}`);
  //   } else {
  //     // Existing logic to view PDF documents
  //     // Example: window.open(`/path/to/documents/${company.documents[0]}`, '_blank');
  //     console.log("Viewing documents:", company.documents);
  //   }
  // };

  const getEmailSentDate = (company) => {
    if (!company.lastEmailSent) return "Not Sent";
    const sentDate = new Date(company.lastEmailSent);
    return sentDate.toLocaleString("en-IN", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: true, // or false for 24-hour format
    });
  };


  const handleEditChange = (field, value) => {
    setEditData((prev) => ({ ...prev, [field]: value }));
  };

  const handleSaveEdit = async () => {
    setActionLoading(true);
    try {
      const response = await fetch(`${BASE_URL}/api/companies/${editData._id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          companyName: editData.companyName,
          username: editData.username,
          groupName: editData.groupName,
          division: editData.division,
          email: editData.email,
          phoneNumber: editData.phoneNumber,
          status: editData.status,
          lastUpdated: new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata" }),
          invoiceNo: editData.invoiceNo,
          invoiceDate: editData.invoiceDate,
          billAmount: editData.billAmount,
        }),
      });

      if (!response.ok) throw new Error(`Failed to update company: ${response.statusText}`);
      setSuccessMessage("Company updated successfully!");
    } catch (error) {
      setErrorMessage(error.message);
    } finally {
      setIsEditing(false);
      setEditData(null);
      setActionLoading(false);
      setTimeout(() => setSuccessMessage(""), 3000);
      setTimeout(() => setErrorMessage(""), 3000);
    }
  };

  const handleExport = async () => {
    // if (!exportEmail) {
    //   setErrorMessage("Please enter an email to send the exported data.");
    //   setTimeout(() => setErrorMessage(""), 3000);
    //   return;
    // }

    const selectedCompanies = companies.filter((company) => selectedRows.includes(company._id));
    if (selectedCompanies.length === 0) {
      setErrorMessage("No companies selected to export.");
      setTimeout(() => setErrorMessage(""), 3000);
      return;
    }

    setActionLoading(true);
    const data = selectedCompanies.map((company, index) => ({
      SNo: company.srNo || index + 1,
      VendorName: company.companyName,
      Username: company.username,
      GroupName: company.groupName || "N/A",
      Division: company.division || "N/A",
      Status: company.status,
      Email: company.email,
      PhoneNumber: company.phoneNumber || "N/A",
      Documents: (company.documents || []).join(", ") || "None",
      LastUpdated: company.lastUpdated,
      EmailSentDate: getEmailSentDate(company),
      InvoiceNo: company.invoiceNo || "N/A",
      InvoiceDate: company.invoiceDate ? new Date(company.invoiceDate).toLocaleDateString("en-IN") : "N/A",
      BillAmount: company.billAmount ? `₹${parseFloat(company.billAmount).toFixed(2)}` : "N/A",
      EmailCount: company.emailCount || 0,
    }));

    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Companies");
    const excelBuffer = XLSX.write(wb, { bookType: "xlsx", type: "array" });
    const excelBlob = new Blob([excelBuffer], { type: "application/octet-stream" });

    const formData = new FormData();
    // formData.append("to", exportEmail);
    formData.append("subject", "Exported Companies");
    formData.append("text", `Dear User,\n\nPlease find attached the exported company data for ${selectedCompanies.length} companies.\n\nBest regards,\nYour Team`);
    formData.append("attachment", excelBlob, "companies.xlsx");

    try {
      const response = await fetch(`${BASE_URL}/api/export-email`, {
        method: "POST",
        body: formData,
      });
      if (!response.ok) throw new Error(`Failed to export company data: ${response.statusText}`);
      saveAs(excelBlob, "companies.xlsx");
      setSuccessMessage("Data exported and emailed successfully!");
    } catch (error) {
      setErrorMessage(error.message);
    } finally {
      setIsExporting(false);
      setExportEmail("granthviramoliya22@gmail.com");
      setActionLoading(false);
      setTimeout(() => setSuccessMessage(""), 3000);
      setTimeout(() => setErrorMessage(""), 3000);
    }
  };

  const handleVendorNameClick = (company) => {
    setSelectedCompanyForHistory(company);
    setIsHistoryOpen(true);
  };



  if (loading) {
    return <div className="flex items-center justify-center h-screen text-gray-600">Loading...</div>;
  }

  return (
    <div className="min-h-screen bg-white overflow-hidden">
      {/* <Navbar onClick={toggleMailbox} emailUser={emailUser} onSearchChange={handleSearchChange} /> */}
      <div className="  flex flex-col">
        {(successMessage || errorMessage) && (
          <div className={`fixed top-16 right-0 px-4 py-2 shadow-lg rounded z-50 ${successMessage ? "bg-green-100 text-green-500" : "bg-red-500 text-white"}`}>
            {successMessage || errorMessage}
          </div>
        )}
        {actionLoading && (
          <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50">
            <div className="bg-white rounded-xl shadow-2xl px-8 py-6 min-w-[320px] relative flex flex-col items-center">
              <button
                className="absolute top-4 right-4 text-gray-400 hover:text-gray-800 text-2xl transition-colors"
                onClick={() => setActionLoading(false)}
                aria-label="Close"
              >
                <svg viewBox="0 0 20 20" fill="currentColor" className="w-6 h-6">
                  <path fillRule="evenodd" d="M10 8.586l4.95-4.95a1 1 0 111.414 1.414L11.414 10l4.95 4.95a1 1 0 01-1.414 1.414L10 11.414l-4.95 4.95a1 1 0 01-1.414-1.414l4.95-4.95-4.95-4.95A1 1 0 015.05 3.636l4.95 4.95z" clipRule="evenodd" />
                </svg>
              </button>
              <div className="text-lg font-semibold text-gray-800 text-center mb-2">
                Resending failed mail...
              </div>
              <div className="text-sm text-gray-500 text-center">
                You can leave now.
              </div>
            </div>
          </div>

        )}
        <div className="flex items-center justify-between mb-1 py-2 bg-[#001828] ">
          <div className="flex items-center space-x-4 pl-2">
            <a href="https://privatecircle.co/" className="mr-4 flex-shrink-0">
              <img src={logo} alt="FUJIFILM Logo" className="h-11 w-auto" />
            </a>
            {/* <h2 className=" font-semibold text-white">Master Profile</h2> */}
          </div>
          <div>
            <div className="relative flex-1 min-w-[600px]">
              <input
                type="text"
                value={searchTerm}
                onChange={handleSearchChange}
                placeholder="Search by name, email"
                className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-1 focus:ring-blue-500 bg-[#001828] text-white placeholder-white"
              />
              {/* Suggestions Dropdown */}
              {isSuggestionDropdownOpen && (
                <div className="absolute left-0 right-0 mt-1 bg-white rounded-md shadow-lg z-50 max-h-60 overflow-y-auto">
                  {suggestions.map((suggestion, index) => (
                    <div
                      key={index}
                      className="px-4 py-2 text-sm text-gray-800 hover:bg-gray-100 cursor-pointer"
                      onClick={() => handleSuggestionClick(suggestion)}
                    >
                      {suggestion}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
          <div className="flex items-center space-x-3 pr-2">
            <label className="flex items-center px-4 py-2 text-sm text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-100 shadow-sm transition-colors duration-150 ease-in-out">
              <FaFileExcel className="w-4 h-4 mr-2 text-green-600" />
              Upload Excel/CSV
              <input
                type="file"
                accept=".xlsx,.xls,.csv"
                onChange={handleFileUpload}
                ref={fileInputRef}
                className="hidden"
              />
            </label>
            <button
              onClick={() => setIsAddCustomerOpen(true)}
              className="flex items-center px-4 py-2 text-sm text-white bg-blue-600 rounded-lg hover:bg-blue-700 shadow-sm transition-colors duration-150 ease-in-out"
            >
              <FaPlus className="w-4 h-4 mr-2" />
              Add Vendor
            </button>

            <div className="relative" ref={actionDropdownRef}>
              <button
                onClick={() => setIsActionDropdownOpen(!isActionDropdownOpen)}
                className="flex items-center px-4 py-2 text-sm text-white bg-gray-600 rounded-lg hover:bg-gray-800 shadow-sm transition-colors duration-150 ease-in-out"
              >
                Action
                <svg className="w-4 h-4 ml-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
                </svg>
              </button>
              {isActionDropdownOpen && (
                <div className="absolute z-20 mt-2 w-48 bg-white border border-gray-200 rounded-lg shadow-lg right-0">
                  {actionOptions.map((option) => (
                    <div
                      key={option}
                      onClick={() => handleActionSelect(option)}
                      className="p-2 text-sm text-gray-700 cursor-pointer hover:bg-gray-100 transition-colors duration-200"
                    >
                      {option}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="metric-container flex gap-4 py-4 bg-gray-50 border-t-2 border-b-2 border-gray-200">


          <div className="metric-box text-center w-[22%]">
            <div className="text-xl md:text-2xl font-bold text-gray-800">{metrics.companyCount}</div>
            <div className="text-xs md:text-sm text-gray-600">Total Companies</div>
          </div>
          <div className="metric-container text-center w-[22%]">
            <div className="text-xl md:text-2xl font-bold text-gray-800">{metrics.emailSent}</div>
            <div className="text-xs md:text-sm text-gray-600">Emails Sent</div>
          </div>
          {/* <div className="metric-container text-center">
            <div className="text-xl md:text-2xl font-bold text-gray-800">{metrics.formSent}</div>
            <div className="text-xs md:text-sm text-gray-600">Forms Sent</div>
          </div> */}
          {/* <div className="metric-container text-center">
            <div className="text-xl md:text-2xl font-bold text-gray-800">{metrics.mailViewed}</div>
            <div className="text-xs md:text-sm text-gray-600">Mail Viewed</div>
          </div> */}
          <div className="metric-container text-center w-[22%]">
            <div className="text-xl md:text-2xl font-bold text-gray-800">{metrics.responded}</div>
            <div className="text-xs md:text-sm text-gray-600">Failed Sent</div>
          </div>
          <div className="metric-container text-center w-[20%]">
            <div className="text-xl md:text-2xl font-bold text-gray-800">{metrics.fileReturned}</div>
            <div className="text-xs md:text-sm text-gray-600">Documents Received</div>
          </div>

          <div className="h-full w-[8%]">
            <div className="relative top-2 left-8" ref={filterDropdownRef}>
              <button
                onClick={() => setIsFilterDropdownOpen(!isFilterDropdownOpen)}
                className="flex items-center px-4 py-2 text-sm text-white bg-gray-600 rounded-lg hover:bg-gray-700 shadow-sm transition-colors duration-150 ease-in-out"
              >
                Filters
                <svg className="w-4 h-4 ml-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
                </svg>
              </button>
              {isFilterDropdownOpen && (
                <div className="absolute z-20 mt-2 w-[600px] bg-white border border-gray-200 rounded-lg shadow-lg p-4 right-8 max-h-[75vh] overflow-y-auto">
                  <div className="flex flex-col gap-4">
                    <button
                      onClick={() =>
                        setFilters({
                          id: [],
                          companyName: [],
                          username: [],
                          groupName: [],
                          division: [],
                          status: [],
                          email: [],
                          phoneNumber: [],
                          lastUpdated: [],
                        }) &&
                        setFilterSearch({
                          id: "",
                          companyName: "",
                          username: "",
                          groupName: "",
                          division: "",
                          status: "",
                          email: "",
                          phoneNumber: "",
                          lastUpdated: "",
                        })
                      }
                      className="mt-2 w-28 px-1 py-1 bg-gray-700 text-white rounded-lg hover:bg-gray-500 text-xs"
                    >
                      Clear All Filters
                    </button>
                    <div className="grid grid-cols-2 gap-4">
                      {[
                        { label: "Vendor Name", key: "companyName" },
                        { label: "Username", key: "username" },
                        { label: "Group Name", key: "groupName" },
                        { label: "Division", key: "division" },
                        { label: "Status", key: "status" },
                        { label: "Email", key: "email" },
                        { label: "Phone Number", key: "phoneNumber" },
                        { label: "Last Updated", key: "lastUpdated" },
                      ].map(({ label, key }) => (
                        <div key={key} className="flex flex-col">
                          <div className="flex items-center justify-between mb-2">
                            <span className="text-[10px] font-semibold text-gray-700">{label}</span>
                            {filters[key].length > 0 && (
                              <button
                                onClick={() => handleRemoveFilter(key)}
                                className="text-xs text-red-500 hover:text-red-700 underline"
                              >
                                Remove
                              </button>
                            )}
                          </div>
                          <input
                            type="text"
                            placeholder={`Search ${label}`}
                            value={filterSearch[key]}
                            onChange={(e) => handleFilterSearchChange(key, e.target.value)}
                            className="w-full px-2 py-1.5 mb-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-400 text-xs"
                          />
                          <div className="max-h-24 overflow-y-auto border border-gray-100 rounded-lg p-2">
                            {filterOptions[key]
                              .filter((option) =>
                                option.toLowerCase().includes(filterSearch[key].toLowerCase())
                              )
                              .map((option) => (
                                <label key={option} className="flex items-center mb-1">
                                  <input
                                    type="checkbox"
                                    checked={filters[key].includes(option)}
                                    onChange={() => handleFilterChange(key, option)}
                                    className="mr-2 h-3 w-3 text-blue-500 focus:ring-blue-400 border-gray-300 rounded"
                                  />
                                  <span className="text-xs text-gray-700">{option}</span>
                                </label>
                              ))}
                          </div>
                        </div>
                      ))}
                    </div>

                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="table-wrapper overflow-x-auto overflow-y-auto w-full h-[calc(100vh-170px)]">
          <table className="min-w-full border-collapse border-gray-200">
            <thead>
              <tr className="bg-gray-100">
                <th className="border-r border-gray-300 px-1 py-1 min-w-[60px] sticky top-0 left-0 bg-gray-100 z-20">
                  <div className="flex items-center gap-1 justify-center">
                    <input
                      type="checkbox"
                      className="w-3 h-3"
                      onChange={handleSelectAll}
                      checked={isAllSelected}
                    />
                    <button
                      onClick={() => sortData("id")}
                      className="text-xs md:text-sm font-semibold text-gray-700 hover:underline"
                    >
                      S.No {sortConfig.key === "id" && (sortConfig.direction === "ascending" ? "↑" : "↓")}
                    </button>
                  </div>
                </th>
                <th className="border-r border-gray-300 px-1 py-1 min-w-[120px] sticky top-0 left-[60px] bg-gray-100 z-20">
                  <button
                    onClick={() => sortData("companyName")}
                    className="text-xs md:text-sm font-semibold text-gray-700 hover:underline"
                  >
                    Vendor Name
                  </button>
                </th>
                <th className="border-x border-gray-300 px-1 py-1 min-w-[100px] sticky top-0 bg-gray-100 z-10">
                  <button
                    onClick={() => sortData("username")}
                    className="text-xs md:text-sm font-semibold text-gray-700 hover:underline"
                  >
                    Username
                  </button>
                </th>
                <th className="border-x border-gray-300 px-1 py-1 min-w-[80px] sticky top-0 bg-gray-100 z-10">
                  <button
                    onClick={() => sortData("groupName")}
                    className="text-xs md:text-sm font-semibold text-gray-700 hover:underline"
                  >
                    Group Name
                  </button>
                </th>
                <th className="border-r border-gray-300 px-1 py-1 min-w-[80px] sticky top-0 bg-gray-100 z-10">
                  <button
                    onClick={() => sortData("division")}
                    className="text-xs md:text-sm font-semibold text-gray-700 hover:underline"
                  >
                    Division
                  </button>
                </th>
                <th className="border-r border-gray-300 px-1 py-1 min-w-[60px] sticky top-0 bg-gray-100 z-10">
                  <button
                    onClick={() => sortData("status")}
                    className="text-xs md:text-sm font-semibold text-gray-700 hover:underline"
                  >
                    Status
                  </button>
                </th>
                <th className="border-r border-gray-300 px-1 py-1 min-w-[120px] sticky top-0 bg-gray-100 z-10">
                  <button
                    onClick={() => sortData("email")}
                    className="text-xs md:text-sm font-semibold text-gray-700 hover:underline"
                  >
                    Email {sortConfig.key === "email" && (sortConfig.direction === "ascending" ? "↑" : "↓")}
                  </button>
                </th>
                <th className="border-r border-gray-300 px-1 py-1 min-w-[100px] sticky top-0 bg-gray-100 z-10">
                  <button
                    onClick={() => sortData("phoneNumber")}
                    className="text-xs md:text-sm font-semibold text-gray-700 hover:underline"
                  >
                    Phone Number {sortConfig.key === "phoneNumber" && (sortConfig.direction === "ascending" ? "↑" : "↓")}
                  </button>
                </th>
                <th className="border-r border-gray-300 px-1 py-1 min-w-[120px] sticky top-0 bg-gray-100 z-10">
                  <span className="text-xs md:text-sm font-semibold text-gray-700">Documents</span>
                </th>
                <th className="border-r border-gray-300 px-1 py-1 min-w-[120px] sticky top-0 bg-gray-100">
                  <span className="text-xs md:text-sm font-semibold text-gray-700">Email Sent Date</span>
                </th>
                <th className="border-r border-gray-300 px-1 py-1 min-w-[120px] sticky top-0 bg-gray-100">
                  <button
                    onClick={() => sortData("lastUpdated")}
                    className="text-xs md:text-sm font-semibold text-gray-700 hover:underline"
                  >
                    Last Updated {sortConfig.key === "lastUpdated" && (sortConfig.direction === "ascending" ? "↑" : "↓")}
                  </button>
                </th>
                {/* <th className="border-r border-gray-300 px-1 py-1 min-w-[100px] sticky top-0 bg-gray-100">
                  <button
                    onClick={() => sortData("invoiceNo")}
                    className="text-xs md:text-sm font-semibold text-gray-700 hover:underline"
                  >
                    Invoice No {sortConfig.key === "invoiceNo" && (sortConfig.direction === "ascending" ? "↑" : "↓")}
                  </button>
                </th>
                <th className="border-r border-gray-300 px-1 py-1 min-w-[100px] sticky top-0 bg-gray-100">
                  <button
                    onClick={() => sortData("invoiceDate")}
                    className="text-xs md:text-sm font-semibold text-gray-700 hover:underline"
                  >
                    Invoice Date {sortConfig.key === "invoiceDate" && (sortConfig.direction === "ascending" ? "↑" : "↓")}
                  </button>
                </th> */}
                <th className="border-r border-gray-300 px-1 py-1 min-w-[100px] sticky top-0 bg-gray-100">
                  <button
                    onClick={() => sortData("billAmount")}
                    className="text-xs md:text-sm font-semibold text-gray-700 hover:underline"
                  >
                    Bill Amount {sortConfig.key === "billAmount" && (sortConfig.direction === "ascending" ? "↑" : "↓")}
                  </button>
                </th>
              </tr>
            </thead>
            <tbody>
              {filteredCompanies.map((company, index) => (
                <tr key={company._id} className="border-b border-gray-200">
                  <td className="border-r border-gray-200 px-1 py-2 sticky left-0 bg-white z-10">
                    <div className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        className="w-4 h-4"
                        onChange={() => handleRowCheckboxChange(company._id)}
                        checked={selectedRows.includes(company._id)}
                      />
                      <span className="text-sm">{company.srNo || index + 1}</span>
                    </div>
                  </td>
                  <td className="border-r border-gray-200 px-4 py-2 min-w-[120px] truncate sticky left-[60px] bg-white z-10">
                    <button
                      // onClick={() => handleVendorNameClick(company)}
                      className="text-sm font-medium hover:underline truncate"
                    >
                      {company.companyName}
                    </button>
                  </td>
                  <td className="border-r border-gray-200 px-4 py-2 min-w-[100px]">

                    {company.username}

                  </td>
                  <td className="border-r border-gray-200 px-2 py-2 min-w-[80px]">
                    <span className="text-sm">{company.groupName || "N/A"}</span>
                  </td>
                  <td className="border-r border-gray-200 px-2 py-2 min-w-[100px]">
                    <span className="text-sm">{company.division || "N/A"}</span>
                  </td>
                  <td className="border-r border-gray-200 px-2 py-2 min-w-[160px]">
                    <span
                      className={` flex justify-center align-middle text-[12px] px-2 py-0.5 rounded-sm font-[550]
      ${(company.status || "Pending") === "Pending"
                          ? "bg-yellow-100 text-yellow-800"
                          : (company.status || "Pending") === "Show Mail"
                            ? "bg-blue-100 text-blue-800"
                            : (company.status || "Pending") === "Documents Submitted"
                              ? "bg-indigo-100 text-indigo-800"
                              : (company.status || "Pending") === "Response Received"
                                ? "bg-green-100 text-green-800"
                                : (company.status || "Pending") === "Payment Confirmed"
                                  ? "bg-emerald-100 text-emerald-800"
                                  : (company.status || "Pending") === "Failed"
                                    ? "bg-gray-500 text-white"
                                    : (company.status || "Pending") === "Payment Not Agreed"
                                      ? "bg-red-100 text-red-800"
                                      : "bg-gray-100 text-gray-800"
                        }
    `}
                    >
                      {company.status || "Pending"}
                    </span>
                  </td>

                  <td className="border-r border-gray-200 px-2 py-2 min-w-[120px] truncate">
                    <span className="text-sm">{company.email}</span>
                  </td>
                  <td className="border-r border-gray-200 px-6 py-2 min-w-[100px]">
                    <span className="text-sm">{company.phoneNumber || "N/A"}</span>
                  </td>
                  <td className="border-r border-gray-200 px-4 py-2 min-w-[120px]">
                    <span className="text-sm">{getDocumentStatus(company)}</span>
                  </td>
                  <td className="border-r border-gray-200 px-4 py-2 min-w-[120px]">
                    <span className="text-sm">{getEmailSentDate(company)}</span>
                  </td>
                  <td className="border-r border-gray-200 px-4 py-2 min-w-[120px]">
                    <span className="text-sm">{company.lastUpdated || "N/A"}</span>
                  </td>
                  {/* <td className="border-r border-gray-200 px-4 py-2 min-w-[120px]">
                    <span className="text-sm">{company.invoiceNo || "N/A"}</span>
                  </td>
                  <td className="border-r border-gray-200 px-4 py-2 min-w-[120px]">
                    <span className="text-sm">
                      {company.invoiceDate ? new Date(company.invoiceDate).toLocaleDateString("en-IN") : "N/A"}
                    </span>
                  </td> */}
                  <td className="border-r border-gray-200 px-4 py-2 min-w-[100px]">
                    <span className="text-sm">
                      {company.billAmount ? `₹${parseFloat(company.billAmount).toFixed(2)}` : "N/A"}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {isMailboxOpen && (
          <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-7xl h-[90vh] border border-gray-100 flex flex-col">

              {/* Header */}
              <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 flex-shrink-0">
                <h2 className="text-xl font-bold text-gray-800">Compose Email</h2>
                <button
                  className="text-gray-400 hover:text-gray-800 text-2xl transition-colors duration-150"
                  onClick={() => setIsMailboxOpen(false)}
                  aria-label="Close"
                >
                  <svg viewBox="0 0 20 20" fill="currentColor" className="w-6 h-6">
                    <path fillRule="evenodd" d="M10 8.586l4.95-4.95a1 1 0 111.414 1.414L11.414 10l4.95 4.95a1 1 0 01-1.414 1.414L10 11.414l-4.95 4.95a1 1 0 01-1.414-1.414l4.95-4.95-4.95-4.95A1 1 0 015.05 3.636l4.95 4.95z" clipRule="evenodd" />
                  </svg>
                </button>
              </div>

              {/* Main Content */}
              <div className="flex flex-1 min-h-0">

                {/* Sidebar */}
                <div className="w-80 bg-gradient-to-b from-gray-50 to-gray-100 p-4 border-r border-gray-200 flex-shrink-0 rounded-bl-2xl">
                  <div className="text-lg font-bold mb-4 text-gray-800">Email Templates</div>
                  <div className="space-y-1 max-h-full overflow-y-auto">
                    {emailTemplates.map((template) => (
                      <div
                        key={template.id}
                        className={`cursor-pointer p-3 rounded-lg text-sm transition-colors duration-150 ${selectedTemplate?.id === template.id
                          ? "bg-blue-100 text-blue-700 border-l-4 border-blue-500"
                          : "hover:bg-gray-100"
                          }`}
                        onClick={() => handleTemplateSelect(template)}
                      >
                        {template.name}
                      </div>
                    ))}
                  </div>
                </div>

                {/* Email Form */}
                <div className="flex-1 p-6 flex flex-col min-w-0">
                  {selectedRows.length === 0 ? (
                    <p className="text-sm text-red-500">Please select at least one company to send an email.</p>
                  ) : (
                    <div className="flex flex-col h-full space-y-4">

                      {/* Recipients */}
                      <div>
                        <label className="text-sm font-medium text-gray-700 mb-2 block">
                          Recipients ({selectedRows.length} companies)
                        </label>
                        <div className="flex flex-wrap gap-2 p-3 bg-gray-50 border border-gray-200 rounded-lg max-h-20 overflow-y-auto">
                          {companies
                            .filter((company) => selectedRows.includes(company._id))
                            .map((company) => (
                              <span
                                key={company._id}
                                className="bg-blue-100 text-blue-700 px-3 py-1 rounded-full text-xs font-medium"
                              >
                                {editableEmails[company._id] || ""}
                              </span>
                            ))}
                        </div>
                      </div>

                      {/* CC Field */}
                      <div>
                        <label className="text-sm font-medium text-gray-700 mb-1 block">CC</label>
                        <input
                          type="text"
                          value={ccEmail}
                          onChange={e => setCcEmail(e.target.value)}
                          placeholder="CC (comma separated)"
                          className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-400 text-sm"
                        />
                      </div>

                      {/* Subject */}
                      <div>
                        <label className="text-sm font-medium text-gray-700 mb-1 block">Subject</label>
                        <input
                          type="text"
                          value={emailSubject}
                          onChange={(e) => setEmailSubject(e.target.value)}
                          placeholder="Enter subject"
                          className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-400 text-sm"
                        />
                      </div>

                      {/* Email Body */}
                      <div className="flex-1 flex flex-col min-h-0">
                        <label className="text-sm font-medium text-gray-700 mb-1 block">Message</label>
                        <textarea
                          value={emailBody}
                          onChange={(e) => setEmailBody(e.target.value)}
                          placeholder="Enter email body"
                          className="flex-1 w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-400 resize-none text-sm min-h-32"
                        />
                      </div>

                      {/* Attachment Section */}
                      <div className="flex items-center justify-between">
                        <div className="flex items-center space-x-4">
                          <label className="flex items-center cursor-pointer text-sm text-blue-600 hover:text-blue-700 transition-colors">
                            <FaFileExcel className="w-4 h-4 mr-2" />
                            Attach File
                            <input
                              type="file"
                              accept=".pdf,.doc,.docx,.jpg,.png,.xlsx,.xls"
                              onChange={(e) => {
                                const file = e.target.files[0];
                                if (file && file.size > 6 * 1024 * 1024) {
                                  alert('File size must be less than 6MB');
                                  e.target.value = '';
                                  return;
                                }
                                setAttachedFile(file);
                              }}
                              className="hidden"
                            />
                          </label>

                          {attachedFile && (
                            <div className="flex items-center bg-gray-100 px-3 py-1 rounded-lg">
                              <span className="text-xs text-gray-600 mr-2">
                                {attachedFile.name} ({(attachedFile.size / 1024 / 1024).toFixed(2)} MB)
                              </span>
                              <button
                                onClick={() => setAttachedFile(null)}
                                className="text-gray-400 hover:text-red-500 transition-colors"
                              >
                                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                                  <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                                </svg>
                              </button>
                            </div>
                          )}
                        </div>

                        {/* Send Button */}
                        <button
                          onClick={handleSendEmail}
                          className="px-6 py-2 bg-gradient-to-r from-blue-600 to-blue-500 text-white rounded-lg shadow hover:from-blue-700 hover:to-blue-600 transition disabled:opacity-60 disabled:cursor-not-allowed text-sm font-medium"
                          disabled={isSendingEmails}
                        >
                          {isSendingEmails ? "Sending..." : "Send Email"}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {isHistoryOpen && selectedCompanyForHistory && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white rounded-md w-3/4 p-6 max-h-[80vh] overflow-auto">
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-lg font-semibold">History for {selectedCompanyForHistory.companyName}</h3>
                <button
                  className="text-gray-600 hover:text-gray-800 text-xl"
                  onClick={() => setIsHistoryOpen(false)}
                >
                  ✗
                </button>
              </div>
              <div className="space-y-6">
                <div>
                  <h4 className="text-md font-semibold text-gray-700">
                    Sent Emails ({selectedCompanyForHistory.emailCount || 0})
                  </h4>
                  {selectedCompanyForHistory.sentEmails?.length > 0 ? (
                    <div className="space-y-4">
                      {selectedCompanyForHistory.sentEmails.map((email, index) => (
                        <div key={index} className="border-b border-gray-200 p-4">
                          <p className="text-sm text-gray-600">
                            <strong>Timestamp:</strong> {email.timestamp}
                          </p>
                          <p className="text-sm text-gray-600">
                            <strong>Subject:</strong> {email.subject}
                          </p>
                          <p className="text-sm text-gray-700 whitespace-pre-wrap">
                            <strong>Body:</strong>
                            <br />
                            {email.body}
                          </p>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-gray-500 mt-1">No emails sent.</p>
                  )}
                </div>
                <div>
                  <h4 className="text-md font-semibold text-gray-700">
                    Replies Received ({selectedCompanyForHistory.receivedEmails?.length || 0})
                  </h4>
                  {selectedCompanyForHistory.receivedEmails?.length > 0 ? (
                    <div className="space-y-4 mt-4">
                      {selectedCompanyForHistory.receivedEmails.map((email, index) => (
                        <div key={index} className="border-b border-gray-200 p-4">
                          <p className="text-sm text-gray-600">
                            <strong>Timestamp:</strong> {email.timestamp}
                          </p>
                          <p className="text-sm text-gray-600">
                            <strong>Subject:</strong> {email.subject}
                          </p>
                          <p className="text-sm text-gray-700 whitespace-pre-wrap">
                            <strong>Body:</strong>
                            <br />
                            {email.body}
                          </p>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-gray-500 mt-1">No replies received.</p>
                  )}
                </div>
                <div>
                  <h4 className="text-md font-semibold text-gray-700">
                    Documents Received ({selectedCompanyForHistory.documents?.length || 0})
                  </h4>
                  {selectedCompanyForHistory.documents?.length > 0 ? (
                    <ul className="list-disc pl-5">
                      {selectedCompanyForHistory.documents.map((doc, index) => (
                        <li key={index} className="text-sm text-gray-600">
                          <button
                            className="text-blue-600 hover:underline"
                            onClick={() => handleDownloadDocument(doc)}
                          >
                            {doc}
                          </button>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-sm text-gray-600 mt-1">No documents found.</p>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}


        {isDocumentsModalOpen && selectedCompanyForDocuments && (
          <div className="fixed inset-0 bg-black/50 bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white rounded-md w-1/2 p-6 max-h-[60vh] overflow-auto">
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-lg font-semibold">
                  {selectedCompanyForDocuments.status === "Payment Not Agreed"
                    ? "Disagreement Reasons"
                    : `Documents for ${selectedCompanyForDocuments.companyName}`}
                </h3>
                <button
                  className="text-gray-600 hover:text-gray-800 text-xl"
                  onClick={() => setIsDocumentsModalOpen(false)}
                >
                  <X size={24} />
                </button>
              </div>
              {console.log('Modal documents:', selectedCompanyForDocuments.documents, 'Status:', selectedCompanyForDocuments.status)}
              {selectedCompanyForDocuments.status === "Payment Not Agreed" ? (
                <div className="text-sm text-gray-600">

                  {Array.isArray(selectedCompanyForDocuments.documents) && selectedCompanyForDocuments.documents.length > 0 ? (
                    <div className="list-disc pl-0 space-y-1 mt-1">
                      {selectedCompanyForDocuments.documents.map((reason, index) => (
                        <p className="text-[16px]" key={index}>{reason || "No reason provided"}</p>
                      ))}
                    </div>
                  ) : (
                    <p className="mt-1">No reasons provided.</p>
                  )}
                </div>
              ) : Array.isArray(selectedCompanyForDocuments.documents) && selectedCompanyForDocuments.documents.length > 0 ? (
                <ul className="list-disc pl-5 space-y-2">
                  {selectedCompanyForDocuments.documents.map((doc, index) => (
                    <li key={index} className="text-sm text-gray-600">
                      <button
                        className="text-blue-600 hover:underline"
                        onClick={() => handleDownloadDocument(doc)}
                      >
                        {doc}
                      </button>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-gray-600">No documents available.</p>
              )}
            </div>
          </div>
        )}
        {isAddCustomerOpen && (
          <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg p-8 border border-gray-100">
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-xl font-bold text-gray-800">Add New Customer</h3>
                <button
                  className="text-gray-400 hover:text-gray-800 text-2xl transition-colors duration-150"
                  onClick={() => setIsAddCustomerOpen(false)}
                  aria-label="Close"
                >
                  <svg viewBox="0 0 20 20" fill="currentColor" className="w-6 h-6">
                    <path
                      fillRule="evenodd"
                      d="M10 8.586l4.95-4.95a1 1 0 111.414 1.414L11.414 10l4.95 4.95a1 1 0 01-1.414 1.414L10 11.414l-4.95 4.95a1 1 0 01-1.414-1.414l4.95-4.95-4.95-4.95A1 1 0 015.05 3.636l4.95 4.95z"
                      clipRule="evenodd"
                    />
                  </svg>
                </button>
              </div>
              <div className="grid grid-cols-2 gap-6">
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1">Vendor Name</label>
                  <input
                    type="text"
                    value={addCustomerData.companyName}
                    onChange={(e) => handleAddCustomerChange("companyName", e.target.value)}
                    className="w-full px-4 py-2 border border-gray-200 rounded-lg bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-400 transition"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1">Username</label>
                  <input
                    type="text"
                    value={addCustomerData.username}
                    onChange={(e) => handleAddCustomerChange("username", e.target.value)}
                    className="w-full px-4 py-2 border border-gray-200 rounded-lg bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-400 transition"
                  />
                </div>
                <div>
                  <label class="block text-xs font-semibold text-gray-600 mb-1">Group Name</label>
                  <input
                    type="text"
                    value={addCustomerData.groupName}
                    onChange={(e) => handleAddCustomerChange("groupName", e.target.value)}
                    className="w-full px-4 py-2 border border-gray-200 rounded-lg bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-400 transition"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1">Division</label>
                  <input
                    type="text"
                    value={addCustomerData.division}
                    onChange={(e) => handleAddCustomerChange("division", e.target.value)}
                    className="w-full px-4 py-2 border border-gray-200 rounded-lg bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-400 transition"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1">Email</label>
                  <input
                    type="email"
                    value={addCustomerData.email}
                    onChange={(e) => handleAddCustomerChange("email", e.target.value)}
                    className="w-full px-4 py-2 border border-gray-200 rounded-lg bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-400 transition"
                  />
                  {errors.email && <p className="text-red-500 text-xs mt-1">{errors.email}</p>}
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1">Phone Number</label>
                  <input
                    type="number"
                    value={addCustomerData.phoneNumber}
                    onChange={(e) => handleAddCustomerChange("phoneNumber", e.target.value)}
                    className="w-full px-4 py-2 border border-gray-200 rounded-lg bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-400 transition"
                  />
                  {errors.phoneNumber && <p className="text-red-500 text-xs mt-1">{errors.phoneNumber}</p>}
                </div>

                <div className="col-span-2">
                  <label className="block text-xs font-semibold text-gray-600 mb-1">Bill Amount</label>
                  <input
                    type="number"
                    value={addCustomerData.billAmount}
                    onChange={(e) => handleAddCustomerChange("billAmount", e.target.value)}
                    className="w-full px-4 py-2 border border-gray-200 rounded-lg bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-400 transition"
                  />
                </div>
              </div>
              <div className="mt-8 flex justify-end">
                <button
                  onClick={handleAddCustomerSubmit}
                  className="px-8 py-2 bg-gradient-to-r from-blue-600 to-blue-500 text-white rounded-lg shadow hover:from-blue-700 hover:to-blue-600 transition"
                  disabled={actionLoading}
                >
                  {actionLoading ? "Adding..." : "Add Customer"}
                </button>
              </div>
            </div>
          </div>
        )}
        {isEditing && editData && (
          <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg p-8 border border-gray-100">
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-xl font-bold text-gray-800">Edit Company Data</h3>
                <button
                  className="text-gray-400 hover:text-gray-800 text-2xl transition-colors duration-150"
                  onClick={() => setIsEditing(false)}
                  aria-label="Close"
                >
                  <svg viewBox="0 0 20 20" fill="currentColor" className="w-6 h-6">
                    <path fillRule="evenodd" d="M10 8.586l4.95-4.95a1 1 0 111.414 1.414L11.414 10l4.95 4.95a1 1 0 01-1.414 1.414L10 11.414l-4.95 4.95a1 1 0 01-1.414-1.414l4.95-4.95-4.95-4.95A1 1 0 015.05 3.636l4.95 4.95z" clipRule="evenodd" />
                  </svg>
                </button>
              </div>
              <div className="grid grid-cols-2 gap-6">
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1">Vendor Name</label>
                  <input
                    type="text"
                    value={editData.companyName || ""}
                    onChange={(e) => handleEditChange("companyName", e.target.value)}
                    className="w-full px-4 py-2 border border-gray-200 rounded-lg bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-400 transition"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1">Username</label>
                  <input
                    type="text"
                    value={editData.username || ""}
                    onChange={(e) => handleEditChange("username", e.target.value)}
                    className="w-full px-4 py-2 border border-gray-200 rounded-lg bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-400 transition"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1">Group Name</label>
                  <input
                    type="text"
                    value={editData.groupName || ""}
                    onChange={(e) => handleEditChange("groupName", e.target.value)}
                    className="w-full px-4 py-2 border border-gray-200 rounded-lg bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-400 transition"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1">Division</label>
                  <input
                    type="text"
                    value={editData.division || ""}
                    onChange={(e) => handleEditChange("division", e.target.value)}
                    className="w-full px-4 py-2 border border-gray-200 rounded-lg bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-400 transition"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1">Email</label>
                  <input
                    type="email"
                    value={editData.email || ""}
                    onChange={(e) => handleEditChange("email", e.target.value)}
                    className="w-full px-4 py-2 border border-gray-200 rounded-lg bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-400 transition"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1">Phone Number</label>
                  <input
                    type="text"
                    value={editData.phoneNumber || ""}
                    onChange={(e) => handleEditChange("phoneNumber", e.target.value)}
                    className="w-full px-4 py-2 border border-gray-200 rounded-lg bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-400 transition"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1">Status</label>
                  <select
                    value={editData.status || "Pending"}
                    onChange={(e) => handleEditChange("status", e.target.value)}
                    className="w-full px-4 py-2 border border-gray-200 rounded-lg bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-400 transition"
                  >
                    {filterOptions.status.map((option) => (
                      <option
                        key={option}
                        value={option}
                        disabled={option === "All"}
                      >
                        {option}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1">Invoice No</label>
                  <input
                    type="text"
                    value={editData.invoiceNo || ""}
                    onChange={(e) => handleEditChange("invoiceNo", e.target.value)}
                    className="w-full px-4 py-2 border border-gray-200 rounded-lg bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-400 transition"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1">Invoice Date</label>
                  <input
                    type="date"
                    value={editData.invoiceDate || ""}
                    onChange={(e) => handleEditChange("invoiceDate", e.target.value)}
                    className="w-full px-4 py-2 border border-gray-200 rounded-lg bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-400 transition"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1">Bill Amount</label>
                  <input
                    type="number"
                    value={editData.billAmount || ""}
                    onChange={(e) => handleEditChange("billAmount", e.target.value)}
                    className="w-full px-4 py-2 border border-gray-200 rounded-lg bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-400 transition"
                  />
                </div>
              </div>
              <div className="mt-8 flex justify-end">
                <button
                  onClick={handleSaveEdit}
                  className="px-8 py-2 bg-gradient-to-r from-blue-600 to-blue-500 text-white rounded-lg shadow hover:from-blue-700 hover:to-blue-600 transition"
                >
                  Save Changes
                </button>
              </div>
            </div>
          </div>

        )}

        {isExporting && (
          <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-8 border border-gray-100">
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-xl font-bold text-gray-800">Export Data</h3>
                <button
                  className="text-gray-400 hover:text-gray-800 text-2xl transition-colors duration-150"
                  onClick={() => setIsExporting(false)}
                  aria-label="Close"
                >
                  <svg viewBox="0 0 20 20" fill="currentColor" className="w-6 h-6">
                    <path fillRule="evenodd" d="M10 8.586l4.95-4.95a1 1 0 111.414 1.414L11.414 10l4.95 4.95a1 1 0 01-1.414 1.414L10 11.414l-4.95 4.95a1 1 0 01-1.414-1.414l4.95-4.95-4.95-4.95A1 1 0 015.05 3.636l4.95 4.95z" clipRule="evenodd" />
                  </svg>
                </button>
              </div>
              <div className="mb-6">
                <label className="block text-sm text-gray-600 font-medium mb-2">
                  Export Data as Excel
                </label>
              </div>
              <div className="flex justify-end">
                <button
                  onClick={handleExport}
                  className="px-8 py-2 bg-gradient-to-r from-blue-600 to-blue-500 text-white rounded-lg shadow hover:from-blue-700 hover:to-blue-600 transition"
                >
                  Export Data
                </button>
              </div>
            </div>
          </div>

        )}
      </div>
    </div>
  );
};

export default Home;