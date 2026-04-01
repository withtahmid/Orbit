// // AppContext.tsx or AppContext.jsx
// import React, { createContext, useContext, useState } from "react";

// const AppContext = createContext(null);

// export const AppProvider = ({ children }) => {
//   const [user, setUser] = useState(null);
//   const [theme, setTheme] = useState("light");
//   const [sidebarOpen, setSidebarOpen] = useState(false);

//   return (
//     <AppContext.Provider
//       value={{
//         user,
//         setUser,
//         theme,
//         setTheme,
//         sidebarOpen,
//         setSidebarOpen,
//       }}
//     >
//       {children}
//     </AppContext.Provider>
//   );
// };

// export const useAppContext = () => useContext(AppContext);
