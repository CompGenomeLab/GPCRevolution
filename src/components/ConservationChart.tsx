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
import annotationPlugin from 'chartjs-plugin-annotation';

ChartJS.register(CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend, annotationPlugin);

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
  const getRegionColor = (region: string, index: number) => {
    const colors = [
      'rgba(100, 149, 237, 0.4)',
      'rgba(255, 99, 132, 0.4)',
      'rgba(54, 162, 235, 0.4)',
      'rgba(255, 205, 86, 0.4)',
      'rgba(75, 192, 192, 0.4)',
      'rgba(153, 102, 255, 0.4)',
      'rgba(255, 159, 64, 0.4)',
      'rgba(199, 199, 199, 0.4)',
      'rgba(83, 102, 255, 0.4)',
      'rgba(255, 99, 71, 0.4)',
    ];
    return colors[index % colors.length];
  };

  const regionGroups = React.useMemo(() => {
    const groups: { region: string; startIndex: number; endIndex: number; colorIndex: number }[] =
      [];
    let currentRegion = '';
    let startIndex = 0;
    let colorIndex = 0;
    const seenRegions = new Set<string>();

    data.forEach((item, index) => {
      if (item.region !== currentRegion) {
        if (currentRegion !== '') {
          groups.push({
            region: currentRegion,
            startIndex,
            endIndex: index - 1,
            colorIndex: colorIndex - 1,
          });
        }
        currentRegion = item.region;
        startIndex = index;
        if (!seenRegions.has(item.region)) {
          seenRegions.add(item.region);
          colorIndex++;
        }
      }
    });

    if (currentRegion !== '') {
      groups.push({
        region: currentRegion,
        startIndex,
        endIndex: data.length - 1,
        colorIndex: colorIndex - 1,
      });
    }

    console.log('Region groups with colors:', groups);
    return groups;
  }, [data]);

  const chartData: ChartData<'bar'> = {
    labels: data.map(d => [d.residue.toString(), d.humanAA]),
    datasets: [
      {
        label: 'Conservation %',
        data: data.map(d => d.conservation),
        backgroundColor: '#434E71',
        borderColor: '#FFFFFF',
        borderWidth: 1,
        barThickness: 'flex',
        categoryPercentage: 1.0,
        barPercentage: 1.0,
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
      annotation: {
        annotations: regionGroups.flatMap(group => {
          const color = getRegionColor(group.region, group.colorIndex);

          return [
            {
              type: 'box' as const,
              xMin: group.startIndex - 0.5,
              xMax: group.endIndex + 0.5,
              yMin: -25,
              yMax: -5,
              backgroundColor: color,
              borderColor: color.replace('0.4', '0.8'),
              borderWidth: 1,
            },
            {
              type: 'label' as const,
              xValue: (group.startIndex + group.endIndex) / 2,
              yValue: -15,
              content: group.region,
              backgroundColor: 'rgba(255, 255, 255, 0.9)',
              borderColor: 'rgba(0, 0, 0, 0.2)',
              borderWidth: 1,
              font: {
                size: 8,
                weight: 'bold' as const,
              },
              color: '#000000',
              padding: 2,
              borderRadius: 3,
            },
          ];
        }),
      },
    },
    scales: {
      y: {
        beginAtZero: true,
        max: 100,
        min: -30,
        title: {
          display: true,
          text: 'Conservation %',
        },
        ticks: {
          stepSize: 20,
          callback: function (this: Scale, tickValue: number | string) {
            if (Number(tickValue) < 0) return '';
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
          text: 'GPCRdb #',
          align: 'start' as const,
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
