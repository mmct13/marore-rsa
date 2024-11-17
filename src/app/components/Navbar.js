import React from "react";
import { MessageSquare } from "lucide-react";
import Link from "next/link";

const Navbar = () => {
  return (
    <nav className="bg-black shadow-lg">
      <div className="max-w-7xl mx-auto px-4">
        <div className="flex items-center h-16">
          <MessageSquare className="h-8 w-8 text-red-600" />
          <span className="ml-2 text-xl font-bold text-white">
            MARORE<span className="text-red-600">CHAT</span>
          </span>
          {/* <div className="ml-auto flex items-center space-x-4">
          <Link
              href="/algamal"
              className="text-gray-300 mr-4 hover:text-white transition-colors duration-200 font-bold"
            >
              Crypter avec AlGamal
            </Link>
            <Link
              href="/"
              className="text-gray-300 ml-4 hover:text-white transition-colors duration-200 font-bold"
            >
              Crypter avec RSA
            </Link>
          </div> */}
        </div>
      </div>
    </nav>
  );
};

export default Navbar;
