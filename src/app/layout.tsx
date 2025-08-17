"use client";

import React from "react";
import { Inter } from "next/font/google";
import "./globals.css";
import { ToastContainer } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";
import WakuProvider from "./WakuProvider";

const inter = Inter({ subsets: ["latin"] });

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  /*
    - LightPush - allows us to send messages
    - Filter - Receive the messages
  */
  return (    
    <html lang="en">
      <body className={inter.className + " w-full min-w-1 max-w-none"}>
        <ToastContainer />
        <WakuProvider>
          {children}
        </WakuProvider>
      </body>
    </html>
  );
}
