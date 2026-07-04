

export function HowItWorks() {
  const steps = [
    {
      step: "01",
      title: "Ingestion & Validation",
      description: "Payloads are received, validated for correct schema, and immediately acknowledged to ensure low latency.",
    },
    {
      step: "02",
      title: "LLM Personalization Pipeline",
      description: "Context is passed to our LLM pipeline which generates personalized, highly-converting subject lines in real-time.",
    },
    {
      step: "03",
      title: "Rate Limiting & Queueing",
      description: "BullMQ takes over, distributing jobs according to our strict sliding-window rate limits across multiple Redis nodes.",
    },
    {
      step: "04",
      title: "Provider Routing",
      description: "The circuit breaker selects the optimal email provider, executing the send with idempotency checks.",
    },
    {
      step: "05",
      title: "Observability & Metrics",
      description: "Prometheus scrapes the metrics, logging delivery status, latencies, and provider health to our dashboard.",
    }
  ];

  return (
    <div className="max-w-5xl mx-auto px-6 py-24 w-full flex-1">
      <div className="text-center mb-20 animate-fade-rise">
        <h2 className="text-4xl md:text-6xl text-foreground font-normal mb-6" style={{ fontFamily: "'Instrument Serif', serif" }}>
          The <em className="not-italic text-muted-foreground">Architecture</em>
        </h2>
        <p className="text-muted-foreground text-lg max-w-2xl mx-auto">
          A seamless flow from ingestion to delivery.
        </p>
      </div>

      <div className="space-y-12 relative before:absolute before:inset-0 before:ml-6 before:-translate-x-px md:before:mx-auto md:before:translate-x-0 before:h-full before:w-0.5 before:bg-gradient-to-b before:from-transparent before:via-border before:to-transparent animate-fade-rise-delay">
        {steps.map((step, idx) => (
          <div key={idx} className="relative flex items-center justify-between md:justify-normal md:odd:flex-row-reverse group is-active">
            <div className="flex items-center justify-center w-12 h-12 rounded-full border-4 border-background bg-secondary text-foreground shrink-0 md:order-1 md:group-odd:-translate-x-1/2 md:group-even:translate-x-1/2 shadow-[0_0_0_1px_rgba(255,255,255,0.1)]">
              <span className="text-sm font-medium">{step.step}</span>
            </div>
            <div className="w-[calc(100%-4rem)] md:w-[calc(50%-3rem)] p-6 rounded-2xl border border-border bg-background/50 backdrop-blur-sm">
              <h3 className="text-xl text-foreground font-medium mb-3">{step.title}</h3>
              <p className="text-muted-foreground text-sm leading-relaxed">{step.description}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
