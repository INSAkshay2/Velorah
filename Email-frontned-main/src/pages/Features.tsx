import { Server, Zap, Shield, Repeat, Activity, Send } from 'lucide-react';

export function Features() {
  const features = [
    {
      title: "Production-Grade Stack",
      description: "Built on Node.js, Redis, and PostgreSQL for maximum throughput and reliability at scale.",
      icon: Server,
    },
    {
      title: "BullMQ Job Processing",
      description: "Robust background job processing with BullMQ ensuring no email gets left behind, even during high load.",
      icon: Activity,
    },
    {
      title: "Sliding-Window Rate Limiting",
      description: "Custom sliding-window rate limiters prevent API bans while maximizing sending speed.",
      icon: Zap,
    },
    {
      title: "Circuit Breaker Failover",
      description: "Automatic failover across 3 major email providers guarantees continuous delivery if one goes down.",
      icon: Shield,
    },
    {
      title: "LLM-Based Personalization",
      description: "Dynamically personalized subject lines using advanced LLMs to dramatically increase open rates.",
      icon: Send,
    },
    {
      title: "Idempotency Guarantees",
      description: "Strict idempotency ensures that recipients never receive the same email twice, regardless of retries.",
      icon: Repeat,
    }
  ];

  return (
    <div className="max-w-7xl mx-auto px-6 py-24 w-full flex-1">
      <div className="text-center mb-16 animate-fade-rise">
        <h2 className="text-4xl md:text-6xl text-foreground font-normal mb-6" style={{ fontFamily: "'Instrument Serif', serif" }}>
          Engineered for <em className="not-italic text-muted-foreground">Scale</em>
        </h2>
        <p className="text-muted-foreground text-lg max-w-2xl mx-auto">
          We processed millions of emails at p95 latency under 200ms with a 99.9% delivery rate under k6 load test.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 animate-fade-rise-delay">
        {features.map((feature, idx) => (
          <div key={idx} className="p-8 rounded-2xl border border-border/50 bg-secondary/20 backdrop-blur-sm hover:bg-secondary/40 transition-colors">
            <feature.icon className="w-8 h-8 text-foreground mb-6" />
            <h3 className="text-xl text-foreground font-medium mb-3">{feature.title}</h3>
            <p className="text-muted-foreground text-sm leading-relaxed">
              {feature.description}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}
