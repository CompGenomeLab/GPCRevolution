'use client';

import React from 'react';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend,
  TooltipItem,
  Scale,
  ChartData,
} from 'chart.js';
import { Bar } from 'react-chartjs-2';

ChartJS.register(CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend);

export interface ConservationDatum {
  residue: number;
  conservation: number;
  conservedAA: string;
  humanAA: string;
  region: string;
  gpcrdb: string;
}

interface ConservationChartProps {
  data: ConservationDatum[];
}

const ConservationChart: React.FC<ConservationChartProps> = ({ data }) => {
  const chartData: ChartData<'bar'> = {
    labels: data.map(d => [d.residue.toString(), d.humanAA]),
    datasets: [
      {
        label: 'Conservation %',
        data: data.map(d => d.conservation),
        backgroundColor: 'rgba(75, 192, 192, 0.6)',
        borderColor: 'rgba(75, 192, 192, 1)',
        borderWidth: 1,
        barThickness: 15,
      },
    ],
  };

  const options = {
    responsive: true,
    maintainAspectRatio: false,
    animation: {
      duration: 0,
    },
    plugins: {
      legend: {
        display: false,
      },
      tooltip: {
        enabled: true,
        mode: 'index' as const,
        intersect: false,
        callbacks: {
          label: function (context: TooltipItem<'bar'>) {
            const index = context.dataIndex;
            const d = data[index];
            return [
              `Res: ${d.residue} (${d.conservation}%)`,
              `AA: ${d.humanAA} | Cons: ${d.conservedAA}`,
              `Region: ${d.region} | GPCRdb: ${d.gpcrdb}`,
            ];
          },
        },
      },
    },
    scales: {
      y: {
        beginAtZero: true,
        max: 100,
        title: {
          display: true,
          text: 'Conservation %',
        },
        ticks: {
          stepSize: 20,
          callback: function (this: Scale, tickValue: number | string) {
            return tickValue + '%';
          },
        },
        grid: {
          display: false,
        },
      },
      x: {
        title: {
          display: true,
          text: 'Residue Number (Human AA)',
        },
        ticks: {
          maxRotation: 0,
          minRotation: 0,
          autoSkip: false,
          maxTicksLimit: undefined,
          font: {
            size: 10,
          },
          callback: function (value: number | string, index: number): string[] {
            const labels = data[index];
            return [labels.humanAA, labels.residue.toString()];
          },
        },
        grid: {
          display: false,
        },
      },
    },
  };

  return (
    <div className="bg-card text-card-foreground rounded-lg p-6 shadow-md">
      <h2 className="text-xl font-semibold text-foreground mb-4">Conservation Plot</h2>
      <div className="relative w-full h-[250px]">
        <div className="absolute inset-0 p-4">
          <div className="w-full h-full overflow-x-auto">
            <div
              style={{
                width: `${Math.max(800, data.length * 25)}px`,
                height: '100%',
              }}
            >
              <Bar data={chartData} options={options} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ConservationChart;
