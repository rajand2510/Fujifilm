import React, { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { HelpCircle, RefreshCw, Bell, Info } from "lucide-react";
import { io } from "socket.io-client";
import logo from "../assets/logo_06.jpg";

// Define navigation items (only Masterprofile)
const navItems = [
  { label: "Masterprofile", href: "/" },
];

// Initialize Socket.IO client with updated port
const socket = io("http://localhost:3003");

export default function Navbar({ onMailtemplateClick, onSearchChange }) {
  const [notifications, setNotifications] = useState([]);
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedEmail, setSelectedEmail] = useState(null); // For email modal
  const [isEmailModalOpen, setIsEmailModalOpen] = useState(false); // To control email modal
  const [suggestions, setSuggestions] = useState([]); // For search suggestions
  const [isSuggestionDropdownOpen, setIsSuggestionDropdownOpen] = useState(false); // To control suggestion dropdown

  // Fetch initial notifications
  useEffect(() => {
    const fetchNotifications = async () => {
      try {
        const response = await fetch("http://localhost:3003/api/notifications");
        if (!response.ok) {
          throw new Error("Failed to fetch notifications");
        }
        const data = await response.json();
        setNotifications(data);
        setUnreadCount(data.filter((n) => !n.read).length);
      } catch (error) {
        console.error("Error fetching notifications:", error.message);
      }
    };
    fetchNotifications();

    // Listen for new notifications
    socket.on("newNotification", (notification) => {
      setNotifications((prev) => [...prev, notification]);
      setUnreadCount((prev) => prev + (notification.read ? 0 : 1));
    });

    // Listen for updated notifications (e.g., marked as read)
    socket.on("notificationUpdated", (updatedNotification) => {
      setNotifications((prev) =>
        prev.map((n) =>
          n.id === updatedNotification.id ? updatedNotification : n
        )
      );
      setUnreadCount((prev) => prev - (updatedNotification.read ? 1 : 0));
    });

    return () => {
      socket.off("newNotification");
      socket.off("notificationUpdated");
    };
  }, []);

  // Fetch company names for suggestions when search term changes
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

  // Handle marking notification as read
  const markAsRead = async (notificationId) => {
    try {
      const response = await fetch(
        `http://localhost:3003/api/notifications/read/${notificationId}`,
        {
          method: "POST",
        }
      );
      if (!response.ok) {
        throw new Error("Failed to mark notification as read");
      }
    } catch (error) {
      console.error("Error marking notification as read:", error.message);
    }
  };

  // Toggle dropdown
  const toggleDropdown = () => {
    setIsDropdownOpen(!isDropdownOpen);
  };

  // Handle search input change
  const handleSearchChange = (e) => {
    const value = e.target.value;
    setSearchTerm(value);
    onSearchChange(value); // Pass the search term to the parent (Home.js)
  };

  // Handle selecting a suggestion
  const handleSuggestionClick = (suggestion) => {
    setSearchTerm(suggestion);
    onSearchChange(suggestion);
    setIsSuggestionDropdownOpen(false);
  };

  // Handle opening email modal
  const openEmailModal = (notification) => {
    setSelectedEmail(notification);
    setIsEmailModalOpen(true);
    if (!notification.read) {
      markAsRead(notification.id);
    }
  };

  // Close email modal
  const closeEmailModal = () => {
    setIsEmailModalOpen(false);
    setSelectedEmail(null);
  };

  return (
    <nav className="bg-[#001828] flex items-center px-4 py-1.5 w-full relative">
      {/* Logo */}
      <a href="https://privatecircle.co/" className="mr-4 flex-shrink-0">
        <img src={logo} alt="FUJIFILM Logo" className="h-11 w-auto" />
      </a>

      {/* Main Navigation */}
      <ul className="flex space-x-[6px]">
        {navItems.map((item) => (
          <li key={item.label}>
            <Link
              to={item.href}
              className="flex items-center px-3 py-2 text-white font-semibold text-xs hover:bg-[#00141E] transition"
            >
              {item.label}
            </Link>
          </li>
        ))}
      </ul>

      {/* Search Section */}
      <div className="flex items-center ml-11 flex-1 relative">
        <div className="relative flex-1">
          <input
            type="text"
            value={searchTerm}
            onChange={handleSearchChange}
            placeholder="Search by name, email, or S.No"
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

      {/* Right Side Icons */}
      <div className="flex items-center">
        <button
          className="p-2 rounded-full hover:bg-[#13263d] text-white"
          title="Help"
        >
          <HelpCircle className="w-6 h-auto" />
        </button>
        <button
          className="p-2 rounded-full hover:bg-[#13263d] text-white"
          title="Refresh"
        >
          <RefreshCw className="w-6 h-auto" />
        </button>
        <div className="relative">
          <button
            className="p-2 rounded-full hover:bg-[#13263d] text-white"
            title="Notifications"
            onClick={toggleDropdown}
          >
            <Bell className="w-6 h-auto" />
            {unreadCount > 0 && (
              <span className="absolute top-0 right-0 bg-red-500 text-white text-xs rounded-full h-5 w-5 flex items-center justify-center">
                {unreadCount}
              </span>
            )}
          </button>
          {isDropdownOpen && (
            <div className="absolute right-0 mt-2 w-80 bg-white rounded-lg shadow-lg z-50 max-h-96 overflow-y-auto transition-all duration-300 ease-in-out">
              <div className="p-4 border-b bg-gray-50">
                <h3 className="text-lg font-semibold text-gray-800">
                  Notifications
                </h3>
              </div>
              {notifications.length === 0 ? (
                <div className="p-4 text-gray-600 text-center">
                  No notifications
                </div>
              ) : (
                <ul>
                  {notifications.map((notification) => (
                    <li
                      key={notification.id}
                      className={`p-4 border-b hover:bg-gray-100 cursor-pointer transition-colors ${
                        notification.read ? "bg-gray-50" : "bg-white"
                      }`}
                      onClick={() =>
                        notification.type === "email_received"
                          ? openEmailModal(notification)
                          : !notification.read && markAsRead(notification.id)
                      }
                    >
                      <div className="flex justify-between items-start">
                        <div>
                          {notification.type === "email_sent" ? (
                            <>
                              <p className="text-sm font-medium text-gray-800">
                                Email sent to {notification.companyName}
                              </p>
                              <p className="text-xs text-gray-600">
                                To: {notification.email}
                              </p>
                              <p className="text-xs text-gray-600">
                                Subject: {notification.subject}
                              </p>
                            </>
                          ) : notification.type === "document_returned" ? (
                            <>
                              <p className="text-sm font-medium text-gray-800">
                                Document returned by {notification.companyName}
                              </p>
                              <p className="text-xs text-gray-600">
                                Documents:{" "}
                                {notification.documents.map((doc, index) => (
                                  <React.Fragment key={doc}>
                                    {index > 0 && ", "}
                                    <a
                                      href={`http://localhost:3003/documents/${doc}`}
                                      className="text-blue-500 hover:underline"
                                      target="_blank"
                                      rel="noopener noreferrer"
                                    >
                                      {doc}
                                    </a>
                                  </React.Fragment>
                                ))}
                              </p>
                            </>
                          ) : (
                            // Handle email_received notification
                            <>
                              <p className="text-sm font-medium text-gray-800">
                                Email received from {notification.companyName}
                              </p>
                              <p className="text-xs text-gray-600">
                                Subject: {notification.subject}
                              </p>
                            </>
                          )}
                          <p className="text-xs text-gray-500">
                            {new Date(notification.timestamp).toLocaleString()}
                          </p>
                        </div>
                        {!notification.read && (
                          <span className="text-xs text-blue-500 font-semibold">
                            New
                          </span>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>
        <div className="flex items-center justify-center w-8 h-8 rounded-full bg-gradient-to-br from-[#0d2a42] to-[#183c5a] text-white font-bold">
          S
        </div>
      </div>

      {/* Email Modal for Viewing Received Emails */}
      {isEmailModalOpen && selectedEmail && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg w-1/2 p-6 max-h-[80vh] overflow-y-auto">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-semibold">
                Email from {selectedEmail.companyName}
              </h3>
              <button
                className="text-gray-600 hover:text-gray-800 text-xl"
                onClick={closeEmailModal}
              >
                ✗
              </button>
            </div>
            <div className="space-y-4">
              <div>
                <p className="text-sm font-medium text-gray-800">
                  Subject: {selectedEmail.subject}
                </p>
              </div>
              <div>
                <p className="text-sm text-gray-600">
                  Timestamp: {new Date(selectedEmail.timestamp).toLocaleString()}
                </p>
              </div>
              <div>
                <p className="text-sm text-gray-700 whitespace-pre-wrap">
                  {selectedEmail.body}
                </p>
              </div>
            </div>
          </div>
        </div>
      )}
    </nav>
  );
}