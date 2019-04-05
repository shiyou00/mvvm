// 定义框架类名Mvvm,我们则可以直接实例化new Mvvm() 来调用
class Mvvm {
    constructor(options){
        /**
         * options 则是前台传来的数据
         * {
                el: '#app',
                data: {
                    a: 1,
                    b: { b : 2 }
                }
            }
         */
        const {el,data} = options;
        this._data = data;
        Observe.observeData(data); // 通过该函数把所有前台传来的data中的数据劫持
        this.mount(data); // 把所有的data数据代理到this，也就是Mvvm对象上
        Mvvm.compile(el,this); // 解析模板数据，也就是解析HTML中的{{a}} {{b.b}}
    }
    // 把data中的数据挂载到this上
    mount(data){
        // 遍历data数据 通过defineProperty进行重新创建属性到this上
        for(let key in data){
            Object.defineProperty(this,key,{
                enumerable:true, // 可枚举
                get(){
                    return this._data[key];
                },
                set(newVal){
                    this._data[key] = newVal;
                }
            })
        }
    }

    // 解析模板功能
    static compile(el,_that){
        new Compile(el,_that);
    }
}
// 对数据进行劫持
class Observe{

    constructor(data){
        this.deepObserve(data);
    }

    deepObserve(data){
        let dep = new Dep(); // 创建一个可观察对象
        for(let key in data){
            let value = data[key];
            Observe.observeData(value); // 递归调用数据劫持方法
            this.mount(data,key,value,dep); // 数据劫持主体方法
        }
    }

    mount(data,key,value,dep){
        // 其实就是把data中的数据一层层递归的通过defineProperty方式创建
        Object.defineProperty(data,key,{
            enumerable:true,
            get(){
                Dep.target && dep.addSub(Dep.target); //Dep.target = watcher 这个存在的时候，添加到可观察对象数组中
                return value; // get返回该值
            },
            set(newVal){
                // 当设置值时，新值老值进行比对
                if(newVal === value){
                    return;
                }
                value = newVal;
                Observe.observeData(newVal);// 把后来手动设置的值也劫持了
                dep.notify(); // 发布所有的订阅来更新界面数据
            }
        })
    }

    static observeData(data){
        // 递归的终止条件，这里写的并不完善!! 我们主要目的还是理解mvvm
        if(typeof data !== 'object'){
            return ;
        }
        return new Observe(data);
    }
}

class Compile{
    constructor(el,vm){
        // vm = this
        vm.$el = document.querySelector(el);
        // 创建一个文档片段
        let fragment = document.createDocumentFragment();
        let child;
        while(child = vm.$el.firstChild){
            // 不断遍历DOM，添加到文档片段(内存)中
            fragment.appendChild(child);
        }
        // replace是解析HTML的核心函数
        this.replace(fragment,this,vm);
        // 把更新后的文档片段插入回DOM，达到更新视图的目的
        vm.$el.appendChild(fragment);
    }
    // 解析DOM
    replace(fragment,that,vm){
        // 循环文档片段中的DOM节点
        Array.from(fragment.childNodes).forEach(function (node) {
            let text = node.textContent; // 节点值
            let reg = /\{\{(.*)\}\}/; // 正则匹配{{}}里面的值
            // nodeType === 3 表示文本节点
            if(node.nodeType === 3 && reg.test(text)){
                let arr = RegExp.$1.split('.'); // RegExp.$1获取到 b.b , 并通过.转换成数组
                let val = vm; // val 指针指向 vm对象地址
                arr.forEach(function (k) {
                    val = val[k]; // vm['b'] 可以一层层取到值
                });
                // 给这个node创建一个watcher对象，用于后期视图动态更新使用
                new Watcher(vm,RegExp.$1,function (newVal) {
                    node.textContent = text.replace(reg,newVal);
                });
                // 更新视图 {{a}} ==> 1
                node.textContent = text.replace(reg,val);
            }
            // 元素节点
            if(node.nodeType === 1){
                let nodeAttrs = node.attributes; // 获取DOM节点上的属性列表
                // 遍历该属性列表
                Array.from(nodeAttrs).forEach((attr)=>{
                    let name = attr.name; // 获取属性名 v-model
                    let exp = attr.value; // 获取属性值 "a"
                    if(name.startsWith('v-')){
                        node.value = vm[exp]; // 实现了把a的值添加到input输入框内
                    }
                    // 给该node创建一个watcher对象，用于动态更新视图
                    new Watcher(vm,exp,function (newVal) {
                        node.value = newVal; // 更新输入框的值
                    });
                    // 输入框添加事件
                    node.addEventListener('input',function (e) {
                        // 会调用数据劫持中的set方法，从而触发 dep.notify()发布所有的订阅来更新界面数据
                        vm[exp] = e.target.value;
                    },false);
                })
            }
            // 递归解析DOM节点
            if(node.childNodes){
                that.replace(node,that,vm);
            }
        });
    }
}

// 简单的发布订阅
class Dep{
    constructor(){
        this.subs = [];
    }
    addSub(sub){
        this.subs.push(sub);
    }
    notify(){
        this.subs.forEach(sub=>{
            sub.update();
        })
    }
}

// Watcher对象，用来跟node的关联起来。把后期需要更新的node变成Watcher对象，存入内存中
class Watcher{
    constructor(vm,exp,fn){
        this.vm = vm; // this对象
        this.exp = exp; // 值
        this.fn = fn; // 回调函数
        Dep.target = this; // 发布订阅对象Dep，添加一个属性target = this 也是当前watcher
        let val = vm;
        let arr = exp.split('.');
        arr.forEach(function (k) {
            val = val[k]; // 这个步骤会循环的调用改对象的get，所以就会把该watcher添加到观察数组中
        });
        Dep.target = null;
    }
    // 给每个watcher都加一个update方法，用来发布
    update(){
        // 通过最新 this对象，去取到最新的值，触发watcher的回调函数，来更新node节点中的数据，以达到更新视图的目的
        let val = this.vm;
        let arr = this.exp.split('.');
        arr.forEach(function (k) {
            val = val[k];
        });
        this.fn(val); // 这个传入的val就是最新计算出来的值
    }
}