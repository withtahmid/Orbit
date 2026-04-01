import React from "react";

interface WelcomeEmailProps {
    name: string;
}

const WelcomeEmail: React.FC<WelcomeEmailProps> = ({ name }) => (
    <div style={{ fontFamily: "Arial, sans-serif", lineHeight: "1.5" }}>
        <h1>Welcome, {name}!</h1>
        <p>Thank you for joining our platform. We're excited to have you!</p>
        <p>Best regards,</p>
        <p>The Team</p>
    </div>
);

export default WelcomeEmail;
