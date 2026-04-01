import React from "react";
import ReactDOMServer from "react-dom/server";
import nodemailer from "nodemailer";
import { ENV } from "../../env.mjs";
import { logger } from "../../utils/logger.mjs";

const transporter = nodemailer.createTransport({
    host: ENV.SMTP_HOST,
    port: ENV.SMTP_PORT,
    secure: ENV.SMTP_PORT === 465, // true for 465, false for other ports
    auth:
        ENV.SMTP_USER && ENV.SMTP_PASS
            ? {
                  user: ENV.SMTP_USER,
                  pass: ENV.SMTP_PASS,
              }
            : undefined,
});

const renderTemplate = (
    TemplateComponent: React.ComponentType<any>,
    props: Record<string, any>
) => {
    return ReactDOMServer.renderToStaticMarkup(React.createElement(TemplateComponent, props));
};

export const sendEmail = async (
    to: string,
    subject: string,
    TemplateComponent: React.FC<any>,
    variables: Record<string, any>
) => {
    try {
        const html = renderTemplate(TemplateComponent, variables);
        const info = await transporter.sendMail({
            from: ENV.SMTP_FROM,
            to,
            subject,
            html,
        });
        logger.info(`Email sent to ${to}: ${info.messageId}`);
    } catch (error) {
        logger.error("Error sending email:", error);
        throw error;
    }
};

export const createMailService = () => {
    return {
        sendEmail,
    };
    logger.info("Mailer service initialized and ready to send emails.");
};
