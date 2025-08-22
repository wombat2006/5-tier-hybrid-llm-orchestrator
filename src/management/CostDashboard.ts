import { 
  CostManagementSystem,
  UsageReport,
  CostAlert,
  TokenUsage,
  CostBreakdown
} from '../types/cost-management';
import { PrecisionCostManagementSystem } from './CostManagementSystem';
import * as fs from 'fs/promises';
import * as path from 'path';

interface DashboardData {
  realtime: {
    current_cost: number;
    hourly_burn_rate: number;
    budget_remaining: number;
    budget_utilization_percentage: number;
    active_sessions: number;
    requests_last_hour: number;
    avg_cost_per_request: number;
  };
  alerts: {
    total: number;
    unacknowledged: number;
    critical: CostAlert[];
    warnings: CostAlert[];
  };
  usage_breakdown: {
    by_model: Array<{
      model: string;
      requests: number;
      cost: number;
      tokens: number;
      percentage: number;
      avg_cost_per_request: number;
    }>;
    by_time: Array<{
      hour: string;
      requests: number;
      cost: number;
      tokens: number;
    }>;
  };
  efficiency_metrics: {
    cost_per_successful_task: number;
    token_efficiency_rate: number;
    error_rate_percentage: number;
    avg_quality_score: number;
    most_cost_effective_model: string;
    most_used_model: string;
  };
  projections: {
    monthly_projection: number;
    days_until_budget_exhaustion: number;
    recommended_daily_limit: number;
  };
  recommendations: Array<{
    type: 'cost' | 'performance' | 'usage';
    priority: 'low' | 'medium' | 'high';
    description: string;
    potential_savings: number;
    action: string;
  }>;
}

export class CostManagementDashboard {
  private costSystem: CostManagementSystem;
  private dashboardDir: string;

  constructor(costSystem: CostManagementSystem, dashboardDir: string = './data/dashboard') {
    this.costSystem = costSystem;
    this.dashboardDir = dashboardDir;
    this.initializeDashboard();
  }

  private async initializeDashboard(): Promise<void> {
    try {
      await fs.mkdir(this.dashboardDir, { recursive: true });
      await fs.mkdir(path.join(this.dashboardDir, 'snapshots'), { recursive: true });
      await fs.mkdir(path.join(this.dashboardDir, 'exports'), { recursive: true });
      console.log('[Dashboard] ✅ Dashboard directories initialized');
    } catch (error) {
      console.error('[Dashboard] Failed to initialize directories:', error);
    }
  }

  async generateRealTimeDashboard(): Promise<DashboardData> {
    console.log('[Dashboard] 📊 Generating real-time dashboard...');

    try {
      // リアルタイムデータの収集
      const realtimeData = await this.collectRealtimeData();
      const alertsData = await this.collectAlertsData();
      const usageData = await this.collectUsageData();
      const efficiencyData = await this.calculateEfficiencyMetrics();
      const projectionsData = await this.generateProjections();
      const recommendations = await this.generateRecommendations();

      const dashboard: DashboardData = {
        realtime: realtimeData,
        alerts: alertsData,
        usage_breakdown: usageData,
        efficiency_metrics: efficiencyData,
        projections: projectionsData,
        recommendations
      };

      // ダッシュボードのスナップショットを保存
      await this.saveDashboardSnapshot(dashboard);

      console.log('[Dashboard] ✅ Real-time dashboard generated');
      return dashboard;

    } catch (error) {
      console.error('[Dashboard] ❌ Failed to generate dashboard:', error);
      throw error;
    }
  }

  async exportDetailedReport(format: 'json' | 'csv' | 'html' = 'json'): Promise<string> {
    console.log(`[Dashboard] 📋 Exporting detailed report in ${format} format...`);

    const dashboard = await this.generateRealTimeDashboard();
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    
    let exportPath: string;
    let content: string;

    switch (format) {
      case 'json':
        exportPath = path.join(this.dashboardDir, 'exports', `cost-report-${timestamp}.json`);
        content = JSON.stringify(dashboard, null, 2);
        break;
        
      case 'csv':
        exportPath = path.join(this.dashboardDir, 'exports', `cost-report-${timestamp}.csv`);
        content = this.convertToCSV(dashboard);
        break;
        
      case 'html':
        exportPath = path.join(this.dashboardDir, 'exports', `cost-report-${timestamp}.html`);
        content = this.convertToHTML(dashboard);
        break;
    }

    await fs.writeFile(exportPath, content);
    console.log(`[Dashboard] ✅ Report exported to: ${exportPath}`);
    
    return exportPath;
  }

  async generateOptimizationReport(): Promise<{
    current_efficiency: number;
    optimization_opportunities: Array<{
      area: string;
      current_cost: number;
      optimized_cost: number;
      savings: number;
      implementation: string;
      risk_level: 'low' | 'medium' | 'high';
    }>;
    prioritized_actions: Array<{
      action: string;
      impact: 'low' | 'medium' | 'high';
      effort: 'low' | 'medium' | 'high';
      roi_score: number;
    }>;
  }> {
    console.log('[Dashboard] 💡 Generating cost optimization report...');

    const suggestions = await this.costSystem.suggestCostOptimizations();
    const dashboard = await this.generateRealTimeDashboard();

    const current_efficiency = dashboard.efficiency_metrics.cost_per_successful_task > 0 ? 
      1 / dashboard.efficiency_metrics.cost_per_successful_task * 100 : 100;

    const optimization_opportunities = [
      {
        area: 'Model Selection Optimization',
        current_cost: suggestions.projected_monthly_spend,
        optimized_cost: suggestions.projected_monthly_spend * 0.7,
        savings: suggestions.projected_monthly_spend * 0.3,
        implementation: 'Implement intelligent model routing based on task complexity',
        risk_level: 'low' as const
      },
      {
        area: 'Batch Processing',
        current_cost: suggestions.projected_monthly_spend,
        optimized_cost: suggestions.projected_monthly_spend * 0.85,
        savings: suggestions.projected_monthly_spend * 0.15,
        implementation: 'Group similar requests for batch processing',
        risk_level: 'medium' as const
      },
      {
        area: 'Response Caching',
        current_cost: dashboard.realtime.current_cost,
        optimized_cost: dashboard.realtime.current_cost * 0.8,
        savings: dashboard.realtime.current_cost * 0.2,
        implementation: 'Cache frequently requested responses',
        risk_level: 'low' as const
      }
    ];

    const prioritized_actions = [
      {
        action: 'Optimize model selection for simple tasks',
        impact: 'high' as const,
        effort: 'low' as const,
        roi_score: 85
      },
      {
        action: 'Implement request caching system',
        impact: 'medium' as const,
        effort: 'medium' as const,
        roi_score: 70
      },
      {
        action: 'Setup automated budget alerts',
        impact: 'low' as const,
        effort: 'low' as const,
        roi_score: 60
      }
    ].sort((a, b) => b.roi_score - a.roi_score);

    return {
      current_efficiency,
      optimization_opportunities,
      prioritized_actions
    };
  }

  async getHealthStatus(): Promise<{
    overall_status: 'healthy' | 'warning' | 'critical';
    system_health: {
      budget_health: 'good' | 'warning' | 'critical';
      cost_trend: 'decreasing' | 'stable' | 'increasing';
      error_rate: 'low' | 'medium' | 'high';
      efficiency_trend: 'improving' | 'stable' | 'declining';
    };
    immediate_concerns: string[];
    recommendations: string[];
  }> {
    const health = await this.costSystem.healthCheck();
    const dashboard = await this.generateRealTimeDashboard();

    // 予算健全性の判定
    let budget_health: 'good' | 'warning' | 'critical' = 'good';
    if (dashboard.realtime.budget_utilization_percentage >= 95) {
      budget_health = 'critical';
    } else if (dashboard.realtime.budget_utilization_percentage >= 80) {
      budget_health = 'warning';
    }

    // コスト傾向の分析
    const cost_trend: 'decreasing' | 'stable' | 'increasing' = 
      dashboard.realtime.hourly_burn_rate > dashboard.realtime.current_cost / 30 / 24 ? 'increasing' : 'stable';

    // エラー率の判定
    const error_rate: 'low' | 'medium' | 'high' = 
      dashboard.efficiency_metrics.error_rate_percentage < 5 ? 'low' :
      dashboard.efficiency_metrics.error_rate_percentage < 15 ? 'medium' : 'high';

    const immediate_concerns: string[] = [];
    const recommendations: string[] = [];

    // 懸念事項の特定
    if (budget_health === 'critical') {
      immediate_concerns.push('Budget utilization exceeds 95% - immediate action required');
      recommendations.push('Pause non-essential requests and review spending patterns');
    }

    if (dashboard.alerts.critical.length > 0) {
      immediate_concerns.push(`${dashboard.alerts.critical.length} critical alerts pending`);
      recommendations.push('Acknowledge and address critical cost alerts');
    }

    if (error_rate === 'high') {
      immediate_concerns.push('High error rate detected - system instability');
      recommendations.push('Investigate and resolve recurring errors to prevent cost waste');
    }

    // 推奨事項の追加
    if (dashboard.efficiency_metrics.cost_per_successful_task > 0.50) {
      recommendations.push('Consider using more cost-effective models for simple tasks');
    }

    if (dashboard.realtime.avg_cost_per_request > 0.10) {
      recommendations.push('Optimize prompt engineering to reduce token usage');
    }

    const overall_status: 'healthy' | 'warning' | 'critical' = 
      immediate_concerns.length > 0 && budget_health === 'critical' ? 'critical' :
      immediate_concerns.length > 0 || budget_health === 'warning' ? 'warning' : 'healthy';

    return {
      overall_status,
      system_health: {
        budget_health,
        cost_trend,
        error_rate,
        efficiency_trend: 'stable' // 簡略化
      },
      immediate_concerns,
      recommendations
    };
  }

  // プライベートメソッド

  private async collectRealtimeData(): Promise<DashboardData['realtime']> {
    const realtimeDash = await this.costSystem.getRealTimeDashboard();
    
    return {
      current_cost: realtimeDash.current_cost,
      hourly_burn_rate: realtimeDash.hourly_rate,
      budget_remaining: realtimeDash.budget_remaining,
      budget_utilization_percentage: realtimeDash.current_cost / (realtimeDash.current_cost + realtimeDash.budget_remaining) * 100,
      active_sessions: 3, // モック値
      requests_last_hour: 15, // モック値
      avg_cost_per_request: realtimeDash.current_cost / Math.max(realtimeDash.recent_activity.length, 1)
    };
  }

  private async collectAlertsData(): Promise<DashboardData['alerts']> {
    const allAlerts = await this.costSystem.tracker.getAlerts(false);
    const unacknowledgedAlerts = await this.costSystem.tracker.getAlerts(true);
    
    const criticalAlerts = allAlerts.filter(a => a.type === 'critical' || a.type === 'budget_exceeded');
    const warningAlerts = allAlerts.filter(a => a.type === 'warning');

    return {
      total: allAlerts.length,
      unacknowledged: unacknowledgedAlerts.length,
      critical: criticalAlerts,
      warnings: warningAlerts
    };
  }

  private async collectUsageData(): Promise<DashboardData['usage_breakdown']> {
    const realtimeDash = await this.costSystem.getRealTimeDashboard();
    
    return {
      by_model: realtimeDash.top_models.map(model => ({
        model: model.model,
        requests: Math.floor(Math.random() * 100) + 10, // モック値
        cost: model.cost,
        tokens: Math.floor(model.cost * 10000), // 概算
        percentage: model.percentage,
        avg_cost_per_request: model.cost / Math.max(Math.floor(Math.random() * 100) + 10, 1)
      })),
      by_time: this.generateHourlyUsageData()
    };
  }

  private generateHourlyUsageData(): Array<{hour: string; requests: number; cost: number; tokens: number}> {
    const data = [];
    const now = new Date();
    
    for (let i = 23; i >= 0; i--) {
      const hour = new Date(now.getTime() - i * 60 * 60 * 1000);
      data.push({
        hour: hour.toISOString().substring(11, 16), // HH:MM format
        requests: Math.floor(Math.random() * 20) + 1,
        cost: (Math.random() * 0.50) + 0.01,
        tokens: Math.floor(Math.random() * 5000) + 500
      });
    }
    
    return data;
  }

  private async calculateEfficiencyMetrics(): Promise<DashboardData['efficiency_metrics']> {
    const optimizations = await this.costSystem.suggestCostOptimizations();
    
    return {
      cost_per_successful_task: optimizations.current_monthly_spend / 30, // 日あたり概算
      token_efficiency_rate: 0.85, // モック値
      error_rate_percentage: 3.2, // モック値  
      avg_quality_score: 88.5, // モック値
      most_cost_effective_model: 'qwen3_coder',
      most_used_model: 'qwen3_coder'
    };
  }

  private async generateProjections(): Promise<DashboardData['projections']> {
    const optimizations = await this.costSystem.suggestCostOptimizations();
    const budget = await this.costSystem.tracker.getBudget();
    
    const monthly_projection = optimizations.projected_monthly_spend;
    const daily_burn = monthly_projection / 30;
    const remaining_budget = budget.monthly_budget_usd - optimizations.current_monthly_spend;
    
    return {
      monthly_projection,
      days_until_budget_exhaustion: daily_burn > 0 ? remaining_budget / daily_burn : 999,
      recommended_daily_limit: budget.monthly_budget_usd / 30 * 0.9 // 10%のバッファ
    };
  }

  private async generateRecommendations(): Promise<DashboardData['recommendations']> {
    const optimizations = await this.costSystem.suggestCostOptimizations();
    
    return optimizations.optimizations.map(opt => ({
      type: 'cost' as const,
      priority: opt.priority,
      description: opt.description,
      potential_savings: opt.estimated_savings,
      action: `Implement ${opt.type} optimization`
    }));
  }

  private async saveDashboardSnapshot(dashboard: DashboardData): Promise<void> {
    try {
      const timestamp = new Date().toISOString();
      const snapshotPath = path.join(this.dashboardDir, 'snapshots', `dashboard-${timestamp.substring(0, 16).replace(/[:.]/g, '-')}.json`);
      await fs.writeFile(snapshotPath, JSON.stringify(dashboard, null, 2));
    } catch (error) {
      console.warn('[Dashboard] Failed to save snapshot:', error);
    }
  }

  private convertToCSV(dashboard: DashboardData): string {
    const rows = [
      'Category,Metric,Value,Unit',
      `Realtime,Current Cost,${dashboard.realtime.current_cost},USD`,
      `Realtime,Hourly Burn Rate,${dashboard.realtime.hourly_burn_rate},USD/hour`,
      `Realtime,Budget Remaining,${dashboard.realtime.budget_remaining},USD`,
      `Realtime,Budget Utilization,${dashboard.realtime.budget_utilization_percentage.toFixed(2)},%`,
      `Alerts,Total Alerts,${dashboard.alerts.total},count`,
      `Alerts,Unacknowledged,${dashboard.alerts.unacknowledged},count`,
      `Efficiency,Cost per Task,${dashboard.efficiency_metrics.cost_per_successful_task},USD`,
      `Efficiency,Token Efficiency,${dashboard.efficiency_metrics.token_efficiency_rate},%`,
      `Efficiency,Error Rate,${dashboard.efficiency_metrics.error_rate_percentage},%`,
      `Projections,Monthly Projection,${dashboard.projections.monthly_projection},USD`,
      `Projections,Days Until Budget Exhaustion,${dashboard.projections.days_until_budget_exhaustion},days`
    ];

    return rows.join('\n');
  }

  private convertToHTML(dashboard: DashboardData): string {
    return `
<!DOCTYPE html>
<html>
<head>
    <title>Cost Management Dashboard Report</title>
    <style>
        body { font-family: Arial, sans-serif; margin: 20px; }
        .metric { margin: 10px 0; }
        .section { margin: 20px 0; border: 1px solid #ddd; padding: 15px; }
        .alert-critical { color: red; font-weight: bold; }
        .alert-warning { color: orange; }
        table { border-collapse: collapse; width: 100%; }
        th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
        th { background-color: #f2f2f2; }
    </style>
</head>
<body>
    <h1>Cost Management Dashboard Report</h1>
    <p>Generated: ${new Date().toISOString()}</p>
    
    <div class="section">
        <h2>Real-time Metrics</h2>
        <div class="metric">Current Cost: $${dashboard.realtime.current_cost.toFixed(4)}</div>
        <div class="metric">Hourly Burn Rate: $${dashboard.realtime.hourly_burn_rate.toFixed(4)}/hour</div>
        <div class="metric">Budget Remaining: $${dashboard.realtime.budget_remaining.toFixed(2)}</div>
        <div class="metric">Budget Utilization: ${dashboard.realtime.budget_utilization_percentage.toFixed(2)}%</div>
    </div>
    
    <div class="section">
        <h2>Alerts</h2>
        <div class="metric">Total Alerts: ${dashboard.alerts.total}</div>
        <div class="metric">Unacknowledged: ${dashboard.alerts.unacknowledged}</div>
        <div class="metric alert-critical">Critical Alerts: ${dashboard.alerts.critical.length}</div>
        <div class="metric alert-warning">Warning Alerts: ${dashboard.alerts.warnings.length}</div>
    </div>
    
    <div class="section">
        <h2>Model Usage Breakdown</h2>
        <table>
            <tr><th>Model</th><th>Requests</th><th>Cost ($)</th><th>Percentage</th></tr>
            ${dashboard.usage_breakdown.by_model.map(model => 
              `<tr><td>${model.model}</td><td>${model.requests}</td><td>$${model.cost.toFixed(4)}</td><td>${model.percentage.toFixed(1)}%</td></tr>`
            ).join('')}
        </table>
    </div>
    
    <div class="section">
        <h2>Recommendations</h2>
        <ul>
            ${dashboard.recommendations.map(rec => 
              `<li><strong>${rec.priority.toUpperCase()}:</strong> ${rec.description} (Savings: $${rec.potential_savings.toFixed(2)})</li>`
            ).join('')}
        </ul>
    </div>
</body>
</html>`;
  }
}