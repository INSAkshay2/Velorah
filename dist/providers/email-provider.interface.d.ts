export interface EmailProvider {
    send(to: string, subject: string, html: string): Promise<void>;
}
//# sourceMappingURL=email-provider.interface.d.ts.map