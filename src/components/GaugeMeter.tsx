import React from 'react';
import { PieChart, Pie, Cell, ResponsiveContainer, Label } from 'recharts';

interface GaugeMeterProps {
  score: number; // 0-100 (AI Probability)
  label: string;
}

const GaugeMeter: React.FC<GaugeMeterProps> = ({ score, label }) => {
  // Data for the semi-circle gauge
  const data = [
    { name: 'AI', value: score },
    { name: 'Human', value: 100 - score },
  ];

  // Colors: Red for AI, Green for Human
  const COLORS = ['#ef4444', '#22c55e'];

  return (
    <div className="w-full h-64 flex flex-col items-center justify-center">
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie
            data={data}
            cx="50%"
            cy="80%"
            startAngle={180}
            endAngle={0}
            innerRadius="60%"
            outerRadius="80%"
            paddingAngle={0}
            dataKey="value"
            stroke="none"
            isAnimationActive={true}
            animationDuration={1500}
            animationBegin={0}
          >
            {data.map((entry, index) => (
              <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
            ))}
            <Label
              value={`${score}%`}
              position="center"
              className="text-4xl font-black fill-zinc-900"
              style={{ transform: 'translateY(35px)' }}
            />
          </Pie>
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
};

export default GaugeMeter;
